/**
 * Stories for a family, from whichever source writes them: the catalog
 * templates with their slots filled (`template-stories.js`), or the LLM
 * writing a plot the family chose (`generated-stories.js`, JUG-71). This is
 * what the controller calls; it picks the source and keeps the library.
 * Either way a story is generated once, saved, and reads again exactly as it
 * did; the web never tells the kinds apart.
 *
 * A story can also be asked for in the parent's own words (`requests.js`,
 * JUG-156): the words are read into a request the parent confirms, and the
 * model writes that story like any other.
 *
 * A story the family wants more of becomes a series (`series.js`, JUG-59).
 * Its episodes live in the same table and read the same way; what the library
 * does with them is show them under their series instead of on their own.
 */
import { and, desc, eq, gte, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { withKids } from '../families/families.service.js'
import { NotFoundError, UnavailableError, ValidationError } from '../errors.js'
import { createGeneratedStories } from './generated-stories.js'
import { createStoryRequests, isEmpty, requestFor } from './requests.js'
import { createStorySeries } from './series.js'
import { storyColumns, toStory } from './shared.js'
import { stories, storySeries } from './stories.schema.js'
import { createStoryAudit } from './story-audit.js'
import { createTemplateStories } from './template-stories.js'

/** @typedef {{ id: string, title: string, teaser: string, minutes: number }} StoryOption the id is a plot's or a template's */
/** @typedef {import('./requests.js').StoryRequest} StoryRequest */
/** @typedef {import('./series.js').Series} Series */
/** @typedef {import('./storytelling.js').Sound} Sound */
/** @typedef {import('./series.js').Episode} Episode */
/** @typedef {import('./generated-stories.js').OptionEvent} OptionEvent what an options screen sends, one at a time */
/**
 * @typedef {object} Story
 * @property {string} id
 * @property {string | null} templateId
 * @property {string | null} plotId
 * @property {string | null} keyword the interest the parent tapped to get it (JUG-140)
 * @property {{ id: string, title: string, episode: number } | null} series the series
 *   this story is an episode of (JUG-59), and which episode it is
 * @property {string} title
 * @property {string} teaser
 * @property {number} minutes
 * @property {string[][]} parts
 * @property {Sound[]} sounds the sounds the parent acts out (JUG-170), which the parts mark
 */
/** @typedef {{ id: string, title: string, teaser: string, minutes: number, createdAt: string }} SavedStory */
/**
 * @typedef {{
 *   id: string, title: string, teaser: string, minutes: number,
 *   series: Story['series'], readAt: Date,
 * }} ReadStory
 * A story in the family's history (JUG-188), as its card shows it.
 */
/**
 * @typedef {object} StoryParagraph
 * @property {'paragraph'} type
 * @property {number} part
 * @property {string} text
 */
/**
 * @typedef {object} StoryTitle a story with no plot behind it, named before it is read
 * @property {'title'} type
 * @property {string} title
 */
/**
 * @typedef {object} StorySounds the legend, sent before the first paragraph when there is one (JUG-170)
 * @property {'sounds'} type
 * @property {Sound[]} sounds
 */
/**
 * @typedef {object} StoryDone
 * @property {'story'} type
 * @property {Story} story
 */
/** @typedef {StoryTitle | StorySounds | StoryParagraph | StoryDone} StoryEvent what the reading screen draws, one at a time */
/** @typedef {import('../catalog/catalog.service.js').CatalogService} CatalogService */
/** @typedef {import('../db/client.js').Db} Db */
/** @typedef {import('../families/families.service.js').FamiliesService} FamiliesService */
/** @typedef {import('../llm/client.js').Llm} Llm */
/** @typedef {ReturnType<typeof createStoriesService>} StoriesService */

/** How many stories the shelf holds (JUG-189): the rest are in the family's history. */
const SHELF_SIZE = 2

/** How long a series grows when nobody says otherwise, which config.js does. */
const DEFAULT_SERIES_EPISODES = 10

/**
 * @param {{
 *   db: Db,
 *   catalog: CatalogService,
 *   families: FamiliesService,
 *   llm?: Llm | null,
 *   model?: string,
 *   logger?: { error: (details: object, message: string) => void } | null,
 *   random?: () => number,
 *   now?: () => Date,
 *   maxEpisodes?: number,
 *   usage?: import('../usage/usage.service.js').UsageService | null,
 * }} deps `llm` absent means template stories only; `model` is the model's name,
 *   which the story audit records; `logger` is where a failed audit row is
 *   reported; `now` lets tests fix the moment; `maxEpisodes` is how long a
 *   series may grow; `usage` counts the stories told and the series started
 *   (JUG-198), and absent counts nothing.
 */
export function createStoriesService({
  db,
  catalog,
  families,
  llm = null,
  model = '',
  logger = null,
  random = Math.random,
  now = () => new Date(),
  maxEpisodes = DEFAULT_SERIES_EPISODES,
  usage = null,
}) {
  const templates = createTemplateStories({ db, catalog, families, random })
  // What was offered, picked and written, for adjusting the casting weights (JUG-139).
  const audit = createStoryAudit({ db, logger })
  // Built without an LLM too, since a plot's story that was already written replays without one.
  const generated = createGeneratedStories({ db, llm, families, audit, model, random, now })
  // A series is only ever written by the model; without one it refuses to start.
  const series = createStorySeries({ db, llm, families, audit, model, maxEpisodes, now })
  const requests = createStoryRequests({ llm, families })

  return {
    /**
     * Two stories the family could read, starring the kids playing, as
     * events: one option as each lands, then `done`. With the LLM configured
     * they are plot options the model wrote for the castings code drew, and
     * they arrive one at a time while it is still writing the next; without
     * it they are catalog templates with their slots filled, and both
     * land at once, with the ones in `exclude` (already on screen) last, only
     * if they still fit.
     * @param {string} familyId
     * @param {{ exclude?: string[], userId?: string | null, signal?: AbortSignal }} [options] `userId` is
     *   the adult asking, whose kids sitting out are left out; without one, every kid plays
     * @returns {Promise<AsyncGenerator<OptionEvent, void, void>>}
     */
    async optionsStream(familyId, { exclude = [], userId = null, signal } = {}) {
      const profile = await families.playingProfile(familyId, userId)
      if (!llm) return oneByOne(await templates.options(profile, exclude))
      return generated.options(profile, familyId, { signal })
    },

    /**
     * The story from this template, written for the kids playing.
     * @param {string} familyId
     * @param {string} templateId
     * @param {{ userId?: string | null }} [options] the adult asking; without one, every kid plays
     * @returns {Promise<Story>}
     */
    async write(familyId, templateId, { userId = null } = {}) {
      return templates.write(familyId, templateId, { userId })
    },

    /**
     * The story the chosen id leads to — a plot's or a template's — read
     * aloud, paragraph by paragraph, then once more whole. Whatever it is,
     * it is generated once and saved; rereading it returns the saved story.
     * A reader who leaves early hears no more and nothing is saved.
     * @param {string} familyId
     * @param {string} id a plot or a template
     * @param {{ signal?: AbortSignal, userId?: string | null }} [options] `userId` is the adult
     *   asking: a template story stars their kids playing, a plot's the kids it was written for
     * @returns {Promise<AsyncGenerator<StoryEvent, void, void>>}
     */
    async writeStream(familyId, id, { signal, userId = null } = {}) {
      if (await generated.hasPlot(familyId, id)) return generated.write(familyId, id, { signal })
      if (await catalog.storyTemplateById(id)) return templates.stream(familyId, id, { signal, userId })
      throw new NotFoundError('No such story')
    },

    /**
     * A story about one of the family's interests, written now because the
     * parent tapped it (JUG-140). Only the model writes these, so a server
     * with no LLM says the feature is off. The keyword has to be one of the
     * interests the family saved: anything else is a mistake, not a theme.
     * @param {string} familyId
     * @param {string} keyword
     * @param {{ signal?: AbortSignal, userId?: string | null }} [options] `userId` is the
     *   adult asking, whose kids playing the story stars
     * @returns {Promise<AsyncGenerator<StoryEvent, void, void>>}
     */
    async writeKeywordStream(familyId, keyword, { signal, userId = null } = {}) {
      if (!llm) throw new UnavailableError('No LLM is configured to write a story', 'LLM_OFF')
      const profile = await families.playingProfile(familyId, userId)
      const interest = profile.interests.find((saved) => saved.trim() === keyword.trim())
      if (!interest) throw new ValidationError('That is not one of the family interests', 'UNKNOWN_KEYWORD')
      return generated.writeKeyword(familyId, profile, interest, { signal })
    },

    /**
     * What story the parent's words ask for (JUG-156), for them to see before
     * it is written. Nothing is saved. Only the model reads these, so a server
     * with no LLM says the feature is off.
     * @param {string} familyId
     * @param {string} text the words of the parent's voice note
     * @returns {Promise<StoryRequest>}
     */
    async understandRequest(familyId, text) {
      return requests.understand(familyId, text)
    },

    /**
     * The story the parent asked for, once they saw the request (JUG-156).
     * The request comes back from the web, so it is held to the family's names
     * again: a name that isn't the family's is a character, not a family
     * member. It is written for the kids it names, or for the kids playing
     * when it names none, and a request that asks for nothing is a mistake.
     * @param {string} familyId
     * @param {StoryRequest} asked
     * @param {{ signal?: AbortSignal, userId?: string | null }} [options] `userId` is the
     *   adult asking, whose kids playing the story is for when it names none
     * @returns {Promise<AsyncGenerator<StoryEvent, void, void>>}
     */
    async writeRequestStream(familyId, asked, { signal, userId = null } = {}) {
      if (!llm) throw new UnavailableError('No LLM is configured to write a story', 'LLM_OFF')
      const everyone = await families.profileOf(familyId)
      const request = requestFor(asked, everyone)
      if (isEmpty(request)) throw new ValidationError('That request asks for no story', 'EMPTY_REQUEST')
      const named = everyone.kids.filter((kid) => request.family.includes(kid.name)).map((kid) => kid.id)
      const profile = named.length > 0 ? withKids(everyone, named) : await families.playingProfile(familyId, userId)
      return generated.writeRequest(familyId, profile, request, { signal })
    },

    /**
     * The shelf of stories to read again: the two the family read last, the
     * last one first (JUG-189). The rest are in the family's history
     * (JUG-188). The episodes of a series are not in here: they are read under their
     * series (JUG-50). A series the family stopped following leaves its
     * episodes behind, and those come back as the stories they are.
     * @param {string} familyId
     * @returns {Promise<SavedStory[]>}
     */
    async list(familyId) {
      const rows = await db
        .select({ id: stories.id, title: stories.title, teaser: stories.teaser, minutes: stories.minutes, createdAt: stories.createdAt })
        .from(stories)
        .leftJoin(storySeries, eq(stories.seriesId, storySeries.id))
        .where(and(eq(stories.familyId, familyId), or(isNull(stories.seriesId), isNotNull(storySeries.removedAt))))
        .orderBy(desc(stories.readAt), desc(stories.id))
        .limit(SHELF_SIZE)
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
    },

    /**
     * One saved story, if the family wrote it, with the series it is an
     * episode of when it is one.
     * @param {string} familyId
     * @param {string} storyId
     * @returns {Promise<Story>}
     */
    async find(familyId, storyId) {
      const [row] = await db
        .select({ ...storyColumns, episode: stories.episode, seriesId: storySeries.id, seriesTitle: storySeries.title })
        .from(stories)
        .leftJoin(storySeries, and(eq(stories.seriesId, storySeries.id), isNull(storySeries.removedAt)))
        .where(and(eq(stories.familyId, familyId), eq(stories.id, storyId)))
      if (!row) throw new NotFoundError('No such story')
      const { seriesId, seriesTitle, episode, ...story } = row
      return toStory(story, seriesId ? { id: seriesId, title: seriesTitle, episode: episode ?? 1 } : null)
    },

    /**
     * The parent opened a story to read it (JUG-188), which puts it at the top
     * of the family's history. The database's clock, like the one that set
     * `readAt` when the story was written.
     * @param {string} familyId
     * @param {string} storyId
     */
    async markRead(familyId, storyId) {
      const [row] = await db
        .update(stories)
        .set({ readAt: sql`now()` })
        .where(and(eq(stories.familyId, familyId), eq(stories.id, storyId)))
        .returning({ id: stories.id })
      if (!row) throw new NotFoundError('No such story')
      // The one place a story being told is counted (JUG-198). The reading
      // screen marks a story read as soon as it has an id, a new one included,
      // so this catches every read once and only once.
      await usage?.record('story_told', { familyId })
    },

    /**
     * The stories the family read since a moment, the one read last first
     * (JUG-188), each once, at the last time it was read. Episodes are in it
     * too, with their series while the family follows it.
     * @param {string} familyId
     * @param {{ since: Date, limit: number }} options
     * @returns {Promise<ReadStory[]>}
     */
    async readSince(familyId, { since, limit }) {
      const rows = await db
        .select({
          id: stories.id,
          title: stories.title,
          teaser: stories.teaser,
          minutes: stories.minutes,
          readAt: stories.readAt,
          episode: stories.episode,
          seriesId: storySeries.id,
          seriesTitle: storySeries.title,
        })
        .from(stories)
        .leftJoin(storySeries, and(eq(stories.seriesId, storySeries.id), isNull(storySeries.removedAt)))
        .where(and(eq(stories.familyId, familyId), gte(stories.readAt, since)))
        .orderBy(desc(stories.readAt), desc(stories.id))
        .limit(limit)
      return rows.map(({ seriesId, seriesTitle, episode, ...story }) => ({
        ...story,
        series: seriesId ? { id: seriesId, title: /** @type {string} */ (seriesTitle), episode: episode ?? 1 } : null,
      }))
    },

    /**
     * Turns a story the family has read into the first episode of a series
     * (JUG-59), which they can then ask for more of.
     * @param {string} familyId
     * @param {string} storyId
     * @returns {Promise<Series>}
     */
    async makeSeries(familyId, storyId) {
      const started = await series.fromStory(familyId, storyId)
      await usage?.record('series_started', { familyId })
      return started
    },

    /** The family's series, newest first, each with its episodes in order. @param {string} familyId @returns {Promise<Series[]>} */
    async seriesList(familyId) {
      return series.list(familyId)
    },

    /** One of the family's series. @param {string} familyId @param {string} id @returns {Promise<Series>} */
    async findSeries(familyId, id) {
      return series.find(familyId, id)
    },

    /** The family stops following a series; its episodes stay readable. @param {string} familyId @param {string} id */
    async removeSeries(familyId, id) {
      return series.remove(familyId, id)
    },

    /**
     * The next episode of a series, read out as it is written, like any other
     * story.
     * @param {string} familyId
     * @param {string} id
     * @param {{ signal?: AbortSignal }} [options]
     * @returns {Promise<AsyncGenerator<StoryEvent, void, void>>}
     */
    async episodeStream(familyId, id, { signal } = {}) {
      return series.writeEpisode(familyId, id, { signal })
    },
  }
}

/**
 * The template options as the same events the model's arrive as, so the
 * screen reads one stream whatever wrote them.
 * @param {StoryOption[]} options
 * @returns {AsyncGenerator<OptionEvent, void, void>}
 */
async function* oneByOne(options) {
  for (const option of options) yield { type: 'option', option }
  yield { type: 'done' }
}
