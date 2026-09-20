import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { createCatalogService } from '../src/catalog/catalog.service.js'
import { seededRandom } from '../src/catalog/slots.js'
import { usageEvents } from '../src/usage/usage.schema.js'
import { EXAMPLE_PROFILE, optionsFrom, putFamily, signUpAs, startApi, streamEvents } from './helpers.js'

/** A model that answers with the three plots, and then with a story. */
const fakeLlm = () => ({
  async *stream({ user }) {
    const answer = user.includes('Contestá solo con un objeto JSON')
      ? JSON.stringify({
          tramas: [1, 2, 3].map((n) => ({
            title: `Trama ${n}`,
            teaser: `La número ${n}.`,
            minutes: 4,
            premise: 'Salen a la plaza con el tren grandote. Vuelven a tiempo para la merienda.',
          })),
        })
      : 'PARTE 1\nMilán se despertó.\n\nPARTE 2\nSalieron a la plaza.\n\nPARTE 3\nVolvieron felices.'
    yield answer
  },
})

/** One juego every family fits: no slots to fill, no materials to have. */
const TEMPLATE = {
  slug: 'a-jugar',
  title: 'A jugar',
  minutes: 10,
  place: /** @type {const} */ ('indoor'),
  minAgeMonths: 12,
  maxAgeMonths: 47,
  energy: /** @type {const} */ ('medium'),
  categories: ['pretend'],
  smallSpace: true,
  materials: [],
  themes: [],
  skills: [],
  safety: [],
  why: 'Porque sí.',
  needs: 'nada.',
  steps: ['Jueguen.'],
  easier: 'Más fácil.',
  harder: 'Más difícil.',
}

/** @type {Awaited<ReturnType<typeof startApi>>} */
let api
let emailCount = 0
const signUp = () => signUpAs(api, `uso-${emailCount++}@example.com`)

before(async () => {
  // `now` is left alone on purpose: the rows are stamped by the database's
  // clock, so a pinned one would put every event outside the span counts()
  // asks for.
  api = await startApi({ admin: true, random: seededRandom('usage'), llm: fakeLlm() })
  await createCatalogService({ db: api.db }).addActivityTemplate(TEMPLATE)
})
after(() => api.close())

/** Every row of one event, oldest first. @param {string} event */
const rowsOf = (event) =>
  api.db
    .select()
    .from(usageEvents)
    .where(eq(usageEvents.event, /** @type {'juego_shown'} */ (event)))

/** How many times an event was recorded. @param {string} event */
const countOf = async (event) => (await rowsOf(event)).length

/** A signed-in adult with a family saved. */
const family = async () => {
  const { id, cookie } = await signUp()
  await putFamily(api, cookie, EXAMPLE_PROFILE)
  return { id, cookie }
}

/** @param {string} cookie */
const suggest = (cookie) =>
  api.app.inject({ method: 'POST', url: '/activities/suggestions', headers: { cookie }, payload: {} })

/** @param {string} cookie @param {string} id */
const play = (cookie, id) => api.app.inject({ method: 'POST', url: `/activities/${id}/plays`, headers: { cookie } })

/** A story the family has, written from the first plot they were offered. @param {string} cookie */
const firstStory = async (cookie) => {
  const [option] = optionsFrom(await api.app.inject({ method: 'GET', url: '/stories/options', headers: { cookie } }))
  const response = await api.app.inject({ method: 'POST', url: '/stories/write', headers: { cookie }, payload: { id: option.id } })
  return streamEvents(response.body.toString()).find((event) => event.type === 'story').story
}

test('signing up counts an account, and the first family profile counts a family', async () => {
  const before = { accounts: await countOf('account_created'), families: await countOf('family_created') }
  const { id, cookie } = await signUp()

  assert.equal(await countOf('account_created'), before.accounts + 1, 'the account is counted at sign-up')
  assert.equal(await countOf('family_created'), before.families, 'no family yet: the profile comes later')

  await putFamily(api, cookie, EXAMPLE_PROFILE)
  assert.equal(await countOf('family_created'), before.families + 1)

  // The account's own row knows who it was, and carries no family.
  const account = (await rowsOf('account_created')).at(-1)
  assert.equal(account.userId, id)
  assert.equal(account.familyId, null)
})

test('saving the family again does not count a second family', async () => {
  const { cookie } = await family()
  const counted = await countOf('family_created')

  await putFamily(api, cookie, { ...EXAMPLE_PROFILE, name: 'Los Otero' })
  await putFamily(api, cookie, { ...EXAMPLE_PROFILE, home: 'casa' })

  assert.equal(await countOf('family_created'), counted, 'only the save that started the family counts')
})

test('a juego is counted when it is shown, and again each time it is played', async () => {
  const { cookie } = await family()
  const shown = await countOf('juego_shown')
  const played = await countOf('juego_played')

  const juego = (await suggest(cookie)).json()
  assert.equal(await countOf('juego_shown'), shown + 1)
  assert.equal(await countOf('juego_played'), played, 'shown is not played')

  await play(cookie, juego.id)
  await play(cookie, juego.id)
  assert.equal(await countOf('juego_played'), played + 2, 'the same juego played again counts again')
})

test('a juego that was never suggested is not counted as played', async () => {
  const { cookie } = await family()
  const played = await countOf('juego_played')

  const response = await play(cookie, '11111111-1111-1111-1111-111111111111')

  assert.equal(response.statusCode, 404)
  assert.equal(await countOf('juego_played'), played, 'a failed play counts nothing')
})

test('a story is counted each time it is opened, and a series once when it starts', async () => {
  const { cookie } = await family()
  const told = await countOf('story_told')
  const series = await countOf('series_started')

  // Writing a story is not reading it: the reading screen is what marks it read.
  const story = await firstStory(cookie)
  assert.equal(await countOf('story_told'), told, 'a story written is not yet a story told')

  const read = () => api.app.inject({ method: 'POST', url: `/stories/${story.id}/reads`, headers: { cookie } })
  await read()
  await read()
  assert.equal(await countOf('story_told'), told + 2, 'reading it again counts again')

  await api.app.inject({ method: 'POST', url: `/stories/${story.id}/series`, headers: { cookie } })
  assert.equal(await countOf('series_started'), series + 1)
})

test('the Uso page counts the events all together, lately, and by day', async () => {
  const { cookie } = await family()
  const juego = (await suggest(cookie)).json()
  await play(cookie, juego.id)

  const page = (await api.app.inject({ method: 'GET', url: '/admin/usage' })).json()

  assert.equal(page.days.length, 90, 'three months, one entry a day')
  assert.deepEqual(
    page.days.map((day) => day.day),
    [...page.days.map((day) => day.day)].sort(),
    'oldest first',
  )
  assert.equal(page.totals.juego_played, await countOf('juego_played'))
  assert.equal(page.totals.family_created, await countOf('family_created'))
  // Everything in this file happened just now, so the whole total is also this week's.
  assert.equal(page.recent.juego_played, page.totals.juego_played)
  assert.equal(page.days.at(-1).juego_played, page.totals.juego_played, 'today holds them')
  assert.ok(page.familiesPlayed >= 1, 'at least this family has played')
  // Every event is there, at zero if it never happened.
  assert.equal(typeof page.totals.series_started, 'number')
})

test('the Uso page is only served where the admin is on', async () => {
  const closed = await startApi()
  try {
    assert.equal((await closed.app.inject({ method: 'GET', url: '/admin/usage' })).statusCode, 404)
  } finally {
    await closed.close()
  }
})

test('what happened stays after the account that did it is deleted', async () => {
  const { id, cookie } = await family()
  const juego = (await suggest(cookie)).json()
  await play(cookie, juego.id)
  const played = await countOf('juego_played')

  const response = await api.app.inject({ method: 'DELETE', url: `/admin/users/${id}` })

  assert.equal(response.statusCode, 204)
  assert.equal(await countOf('juego_played'), played, 'the count of what was played does not change')
  const orphaned = (await rowsOf('juego_played')).filter((row) => row.familyId === null)
  assert.ok(orphaned.length >= 1, 'its rows stay, with no family to point at')
})
