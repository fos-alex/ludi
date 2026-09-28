/**
 * Stories, against the real API. A story opened once is kept in the local
 * store under its option's id, which is how it stays readable offline.
 * Both the options and the stories arrive as server-sent events, so a card
 * shows up as soon as the model has written it and the reading screen fills
 * while the model still talks; an already-written story streams the same
 * way, from the saved copy. A story written from one of the family's
 * interests (JUG-140) has no option behind it, so it is kept under the id it
 * was saved with and announces its title first. So is a story the parent
 * asked for in a voice note (JUG-156), once they have seen what Ludi heard.
 *
 * A series (JUG-59) is the family's own, so its list is kept in the store and
 * a screen can show it before the API answers. Its episodes are stories like
 * any other: they stream the same way and are cached under their own ids.
 */
import { read, write } from '../../shared/store'
import { track } from '../../shared/analytics'
import { ApiError, endSession, OfflineError, request, WordedError } from '../../shared/http'

/** @typedef {import('./types').StoryOption} StoryOption */
/** @typedef {import('./types').Story} Story */
/** @typedef {import('./types').SavedStorySummary} SavedStorySummary */
/** @typedef {import('./types').Series} Series */
/** @typedef {import('./types').StoryRequest} StoryRequest */
/** @typedef {import('./types').Sound} Sound */

/** Series copy still needs a voice pass. */
const SERIES_MESSAGES = {
  LLM_OFF: 'Por ahora no podemos armar series.',
  SERIES_FULL: 'Esta serie ya tiene todos sus episodios.',
  ALREADY_IN_SERIES: 'Ese cuento ya es parte de una serie.',
}

/**
 * A series failure the parent can do something about, in words, instead of the
 * generic line. Anything else is left as it is.
 * @param {unknown} error
 */
function seriesFailure(error) {
  const words = error instanceof ApiError && error.code ? SERIES_MESSAGES[error.code] : undefined
  return words ? new WordedError(words) : error
}

/** This server has no LLM to read a story request with: a state to word plainly, not a failure. */
export class StoryRequestOffError extends WordedError {
  constructor() {
    // Voice pass pending.
    super('Por ahora no puedo escribir cuentos a pedido. Elegí uno de estos.')
  }
}

/** The words asked for no story, which is an answer and not a failure either. */
export class NoStoryHeardError extends WordedError {
  constructor() {
    // Voice pass pending.
    super('No escuché qué cuento querés. ¿Probamos de nuevo?')
  }
}

/**
 * The options already on their way, so Home asking for them early and the
 * story screen asking on its own don't both reach the API (JUG-140).
 * @type {{ exclude: string, options: Promise<StoryOption[]>, signal?: AbortSignal } | null}
 */
let asking = null

/**
 * Three options, leaving out the ones on screen, each written into the store
 * as it lands, so the screen shows the first card while the model is still
 * writing the third. The list starts empty, so whatever was on screen before
 * is gone as soon as the parent asks for others. A second call for the same
 * options while the first is still out waits for that one instead of asking
 * again, so Home and the story screen never ask twice (JUG-140).
 * @param {{ exclude?: string[], signal?: AbortSignal }} [options]
 * @returns {Promise<StoryOption[]>}
 */
export function storyOptions({ exclude = [], signal } = {}) {
  const key = exclude.join(',')
  // A request its caller already stopped is no use to the next one.
  if (asking?.exclude === key && !asking.signal?.aborted) return asking.options
  const options = askForOptions(exclude, signal)
  asking = { exclude: key, options, signal }
  void options
    .catch(() => {})
    .then(() => {
      if (asking?.options === options) asking = null
    })
  return options
}

/** @param {string[]} exclude @param {AbortSignal} [signal] @returns {Promise<StoryOption[]>} */
async function askForOptions(exclude, signal) {
  const query = new URLSearchParams(exclude.map((id) => ['exclude', id]))
  write('storyOptions', [])
  const body = await openStream(`/api/stories/options${exclude.length > 0 ? `?${query}` : ''}`, { method: 'GET', signal })

  /** @type {StoryOption[]} */
  const options = []
  let done = false
  await readEvents(body, (event) => {
    if (event.type === 'error') throw new ApiError('No pudimos traer los cuentos', 0)
    if (event.type === 'option') {
      options.push(/** @type {StoryOption} */ (event.option))
      write('storyOptions', [...options])
    }
    if (event.type === 'done') {
      done = true
      return true
    }
    return false
  })
  if (!done) throw new ApiError('No pudimos traer los cuentos', 0)
  return options
}

/**
 * What the reading screen hears while a story arrives: its title when it has
 * no option behind it, its sounds before the first paragraph (JUG-170), and
 * each paragraph as it lands.
 * @typedef {{
 *   signal?: AbortSignal,
 *   onTitle?: (title: string) => void,
 *   onSounds?: (sounds: Sound[]) => void,
 *   onParagraph?: (paragraph: { part: number, text: string }) => void,
 * }} StoryHandlers
 */

/**
 * The story behind an option, coming out of the API paragraph by paragraph.
 * `onParagraph` is called as each one lands, so the reading screen fills
 * while the model still talks; the whole saved story comes back once and is
 * cached for offline.
 * @param {string} id the option's id
 * @param {Omit<StoryHandlers, 'onTitle'>} [handlers]
 * @returns {Promise<Story>}
 */
export async function writeStory(id, handlers = {}) {
  const cached = read('stories')?.[id]
  if (cached) return cached
  return await readStory('/api/stories/write', { id }, { ...handlers, key: id })
}

/**
 * A story about one of the family's interests, written now because the parent
 * tapped it (JUG-140). It has no option behind it, so its title arrives as its
 * own event before the first paragraph, and it is kept under the id the API
 * saved it with, which is where the reading screen sends the URL.
 * @param {string} keyword the interest, exactly as the family typed it
 * @param {StoryHandlers} [handlers]
 * @returns {Promise<Story>}
 */
export async function writeKeywordStory(keyword, handlers = {}) {
  return await readStory('/api/stories/write', { keyword }, handlers)
}

/**
 * What story a voice note's words ask for (JUG-156): who is in it, where it
 * happens, its theme, and what happens, for the parent to see before anything
 * is written. Words that ask for no story say so in words.
 * @param {string} text the words of the voice note
 * @returns {Promise<StoryRequest>}
 */
export async function understandStoryRequest(text) {
  /** @type {StoryRequest} */
  let heard
  try {
    heard = await request('POST', '/stories/understanding', { text })
  } catch (error) {
    if (error instanceof ApiError && error.code === 'LLM_OFF') throw new StoryRequestOffError()
    throw error
  }
  if (!heard.summary) throw new NoStoryHeardError()
  return heard
}

/**
 * The parent said yes to the story they asked for: it is kept on the device
 * until it is written, so the reading screen can write it and try again.
 * @param {StoryRequest} asked
 */
export function askForStory(asked) {
  write('storyRequest', asked)
}

/**
 * The story the parent asked for (JUG-156), written now, arriving the way a
 * keyword story does: its own title first, then the paragraphs. Once it is
 * saved the request is forgotten, since the story now has an id of its own.
 * @param {StoryRequest} asked
 * @param {StoryHandlers} [handlers]
 * @returns {Promise<Story>}
 */
export async function writeRequestedStory(asked, handlers = {}) {
  let story
  try {
    story = await readStory('/api/stories/write', { request: asked }, handlers)
  } catch (error) {
    if (error instanceof ApiError && error.code === 'LLM_OFF') throw new StoryRequestOffError()
    throw error
  }
  write('storyRequest', null)
  return story
}

/**
 * The next episode of a series (JUG-59), written now, arriving the same way a
 * story does: its own title first, then the paragraphs. It is kept under the
 * id the API saved it with, which is where the reading screen sends the URL,
 * and the series it belongs to is refreshed, since the second episode is what
 * gives a series its name.
 * @param {string} seriesId
 * @param {StoryHandlers} [handlers]
 * @returns {Promise<Story>}
 */
export async function writeEpisode(seriesId, handlers = {}) {
  let episode
  try {
    episode = await readStory(`/api/series/${seriesId}/episodes`, null, handlers)
  } catch (error) {
    throw seriesFailure(error)
  }
  // The second episode is what gives a series its name, so the list is asked
  // for again; a failure there leaves the screen with what it had.
  await familySeries().catch(() => {})
  return episode
}

/**
 * The story the API writes for what it is asked, paragraph by paragraph, kept
 * for offline once it is whole.
 * @param {string} url the stream to open
 * @param {{ id: string } | { keyword: string } | { request: StoryRequest } | null} asked what to write, when the URL doesn't say it
 * @param {StoryHandlers & { key?: string }} handlers `key` is where to keep the
 *   story; without one it is kept under the id the API saved it with.
 * @returns {Promise<Story>}
 */
async function readStory(url, asked, { key, signal, onTitle, onSounds, onParagraph }) {
  const body = await openStream(url, {
    method: 'POST',
    headers: asked ? { 'Content-Type': 'application/json' } : undefined,
    body: asked ? JSON.stringify(asked) : undefined,
    signal,
  })

  /** @type {Story | null} */
  let story = null
  await readEvents(body, (event) => {
    if (event.type === 'error') throw new ApiError('La historia no terminó', 0)
    if (event.type === 'title') onTitle?.(event.title ?? '')
    if (event.type === 'sounds') onSounds?.(event.sounds ?? [])
    if (event.type === 'paragraph') onParagraph?.({ part: event.part ?? 1, text: event.text ?? '' })
    if (event.type === 'story') {
      story = /** @type {Story} */ (event.story)
      return true
    }
    return false
  })
  if (!story) throw new ApiError('La historia no terminó', 0)
  write('stories', { ...read('stories'), [key ?? /** @type {Story} */ (story).id]: story })
  return story
}

/**
 * Opens one of the API's event streams. It reads `fetch` directly because
 * `request` only speaks JSON; like it, no network means `OfflineError` and a
 * refusal means `ApiError`, so the screens and `failureText()` are unchanged.
 * Whatever the API refuses with arrives before the stream starts, so it is a
 * regular JSON body.
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<ReadableStream<Uint8Array>>}
 */
async function openStream(url, init) {
  if (!navigator.onLine) throw new OfflineError('Sin conexión')

  let response
  try {
    response = await fetch(url, init)
  } catch (error) {
    // A screen that left cancelled the stream on purpose; that is not a failure.
    if (/** @type {Error} */ (error)?.name === 'AbortError') throw error
    throw new OfflineError('Sin conexión')
  }
  if (!response.ok) {
    if (response.status === 401) endSession()
    const data = await response.json().catch(() => null)
    throw new ApiError(data?.message ?? data?.error ?? `HTTP ${response.status}`, response.status, data?.code)
  }
  if (!response.body) throw new ApiError('Sin respuesta', 0)
  return response.body
}

/**
 * Reads a server-sent event stream, handing each event to `onEvent` as it
 * lands and stopping when it says it has what it came for.
 * @param {ReadableStream<Uint8Array>} body
 * @param {(event: any) => boolean} onEvent true when the stream is done
 */
async function readEvents(body, onEvent) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let index
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      const line = block.split('\n').find((streamLine) => streamLine.startsWith('data: '))
      if (!line) continue
      if (onEvent(JSON.parse(line.slice(6)))) {
        await reader.cancel().catch(() => {})
        return
      }
    }
  }
}

/**
 * The library of stories the family saved, newest first.
 * @returns {Promise<SavedStorySummary[]>}
 */
export async function savedStories() {
  const list = await request('GET', '/stories')
  return /** @type {SavedStorySummary[]} */ (list)
}

/**
 * One saved story, opened by its own id, kept for offline like any story.
 * @param {string} id the story's id
 * @returns {Promise<Story>}
 */
export async function savedStory(id) {
  const cached = read('stories')?.[id]
  if (cached) return cached
  const { title, teaser, minutes, parts, sounds, keyword, series: inSeries } = await request('GET', `/stories/${id}`)
  const story = { id, title, teaser, minutes, parts, sounds, keyword, series: inSeries }
  write('stories', { ...read('stories'), [id]: story })
  return story
}

/**
 * Tells the API the parent opened a story to read it (JUG-188), which puts it
 * at the top of the family's history. Nothing waits on it: a failure, offline
 * included, only leaves this read out of the history.
 * @param {string} id the story's own id
 */
export function markRead(id) {
  request('POST', `/stories/${id}/reads`).then(
    () => track('story_told'),
    () => {},
  )
}

/**
 * Where this device keeps a story, which is also the URL that opens it: the
 * option's id for a story picked from the options, and the story's own id
 * otherwise. A story the device doesn't have is opened by its own id, and the
 * reading screen asks the API for it.
 * @param {string} id the story's own id
 * @returns {string}
 */
export function storyKey(id) {
  /** @type {Record<string, Story>} */
  const stories = read('stories') ?? {}
  if (stories[id]) return id
  return Object.keys(stories).find((key) => stories[key].id === id) ?? id
}

/**
 * The family's series, newest first, each with its episodes in order. They are
 * kept on the device, so the screen shows the last ones it saw while the API
 * answers, and offline.
 * @returns {Promise<Series[]>}
 */
export async function familySeries() {
  const { series } = await request('GET', '/series')
  write('series', series)
  return /** @type {Series[]} */ (series)
}

/**
 * One series, with its episodes. The stored list is kept in step with it, so
 * the screen the parent goes back to shows the same thing.
 * @param {string} id
 * @returns {Promise<Series>}
 */
export async function series(id) {
  const found = /** @type {Series} */ (await request('GET', `/series/${id}`))
  remember(found)
  return found
}

/**
 * Turns a story the family has read into a series, whose first episode it
 * becomes (JUG-59).
 * @param {string} storyId
 * @returns {Promise<Series>}
 */
export async function makeSeries(storyId) {
  try {
    const started = /** @type {Series} */ (await request('POST', `/stories/${storyId}/series`))
    remember(started)
    placeInSeries((story) => story.id === storyId, { id: started.id, title: started.title, episode: 1 })
    track('series_started')
    return started
  } catch (error) {
    throw seriesFailure(error)
  }
}

/**
 * The family stops following a series. It shows up nowhere from now on, and
 * its episodes go back to the library as the stories they are.
 * @param {string} id
 */
export async function forgetSeries(id) {
  await request('DELETE', `/series/${id}`)
  write('series', (read('series') ?? []).filter((/** @type {Series} */ kept) => kept.id !== id))
  placeInSeries((story) => story.series?.id === id, null)
}

/**
 * Keeps the stories on the device in step with the series they belong to, so
 * the end of a story and Home offer the right next step without asking the API.
 * A story can be kept under more than one key (its option's id and its own).
 * @param {(story: Story) => boolean} matches the stories to change
 * @param {import('./types').StoryInSeries | null} inSeries
 */
function placeInSeries(matches, inSeries) {
  /** @type {Record<string, Story>} */
  const stories = read('stories') ?? {}
  const updated = Object.entries(stories).map(([key, story]) => [key, matches(story) ? { ...story, series: inSeries } : story])
  write('stories', Object.fromEntries(updated))
}

/** Keeps the stored list in step with one series. @param {Series} series */
function remember(series) {
  const rest = (read('series') ?? []).filter((/** @type {Series} */ kept) => kept.id !== series.id)
  write('series', [series, ...rest])
}

/**
 * Remembers the story the parent opened last, so Home can offer it again. The
 * key is where the story is kept on the device, which is also its URL.
 * @param {string} key
 */
export function rememberLastStory(key) {
  if (read('lastStoryId') !== key) write('lastStoryId', key)
}

/** Forgets the options on this device, so the story screen asks for new ones. */
export function forgetOptions() {
  write('storyOptions', null)
}

/**
 * Saves how far into a story the parent has scrolled, from 0 to 1, so a
 * reopened story resumes there.
 * @param {string} id
 * @param {number} progress
 */
export function savePosition(id, progress) {
  write('storyPositions', { ...read('storyPositions'), [id]: progress })
}
