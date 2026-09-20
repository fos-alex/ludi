import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGa } from '../../src/usage/ga.js'

const CONFIG = { measurementId: 'G-TEST123', apiSecret: 'a-secret', debug: false }
const SECRET = 'test-secret-that-is-at-least-32-chars'
const AT = new Date('2026-09-20T23:30:00-03:00')

/** A fetch that records what it was asked to send. @param {Partial<Response>} [answer] */
const spyFetch = (answer = {}) => {
  /** @type {{ url: URL, body: any }[]} */
  const calls = []
  /** @type {any} */
  const fetch = async (/** @type {URL} */ url, /** @type {RequestInit} */ options) => {
    calls.push({ url, body: JSON.parse(String(options.body)) })
    return { status: 204, text: async () => '', ...answer }
  }
  return { calls, fetch }
}

/** @param {object} [deps] */
const ga = (deps = {}) => createGa({ config: CONFIG, secret: SECRET, now: () => AT, ...deps })

test('an event goes to the measurement protocol with the stream and the secret', async () => {
  const { calls, fetch } = spyFetch()

  await ga({ fetch }).send('juego_played', { familyId: 'family-1' })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url.origin + calls[0].url.pathname, 'https://www.google-analytics.com/mp/collect')
  assert.equal(calls[0].url.searchParams.get('measurement_id'), 'G-TEST123')
  assert.equal(calls[0].url.searchParams.get('api_secret'), 'a-secret')
  assert.deepEqual(
    calls[0].body.events.map((event) => event.name),
    ['juego_played'],
  )
})

test('Google is told the event and nothing that says who the family is', async () => {
  const { calls, fetch } = spyFetch()

  await ga({ fetch }).send('story_told', { familyId: 'family-1', userId: 'user-1' })

  const sent = JSON.stringify(calls[0].body)
  assert.ok(!sent.includes('family-1'), 'the family id never leaves')
  assert.ok(!sent.includes('user-1'), 'neither does the account id')
  assert.equal(calls[0].body.non_personalized_ads, true, 'Ludi never advertises to a family')
  assert.deepEqual(Object.keys(calls[0].body.events[0].params).sort(), ['engagement_time_msec', 'session_id'])
})

test('the same family is the same pseudonym, and two families are not', async () => {
  const { calls, fetch } = spyFetch()
  const sender = ga({ fetch })

  await sender.send('juego_shown', { familyId: 'family-1' })
  await sender.send('juego_played', { familyId: 'family-1' })
  await sender.send('juego_shown', { familyId: 'family-2' })

  assert.equal(calls[0].body.client_id, calls[1].body.client_id)
  assert.notEqual(calls[0].body.client_id, calls[2].body.client_id)
  assert.match(calls[0].body.client_id, /^\d+\.\d+$/, "GA4's two-number shape")
})

test('another server secret gives another pseudonym for the same family', async () => {
  const { calls, fetch } = spyFetch()

  await ga({ fetch }).send('juego_shown', { familyId: 'family-1' })
  await ga({ fetch, secret: 'another-secret-that-is-32-chars-ok' }).send('juego_shown', { familyId: 'family-1' })

  assert.notEqual(calls[0].body.client_id, calls[1].body.client_id)
})

test('an account with no family yet is still counted as somebody', async () => {
  const { calls, fetch } = spyFetch()

  await ga({ fetch }).send('account_created', { userId: 'user-1' })

  assert.match(calls[0].body.client_id, /^\d+\.\d+$/)
})

test('one session a day, where the families are and not in UTC', async () => {
  const { calls, fetch } = spyFetch()
  // Half past eleven at night in Buenos Aires is already the next day in UTC.
  const lateEvening = new Date('2026-09-20T23:30:00-03:00')
  const sameEvening = new Date('2026-09-20T20:00:00-03:00')
  const nextMorning = new Date('2026-09-21T08:00:00-03:00')

  await ga({ fetch, now: () => lateEvening }).send('story_told', { familyId: 'family-1' })
  await ga({ fetch, now: () => sameEvening }).send('story_told', { familyId: 'family-1' })
  await ga({ fetch, now: () => nextMorning }).send('story_told', { familyId: 'family-1' })

  const [late, same, next] = calls.map((call) => call.body.events[0].params.session_id)
  assert.equal(late, same, 'a story at eleven at night belongs to that evening')
  assert.notEqual(late, next)
})

test('a failing Google never reaches the parent', async () => {
  const failing = async () => {
    throw new Error('the network is down')
  }
  /** @type {object[]} */
  const logged = []
  const sender = createGa({
    config: CONFIG,
    secret: SECRET,
    fetch: /** @type {any} */ (failing),
    logger: { error: (details) => logged.push(details), info: () => {} },
  })

  await sender.send('juego_played', { familyId: 'family-1' })

  assert.equal(logged.length, 1, 'it is logged and let go')
})

test('the debug endpoint is where a payload gets checked', async () => {
  const { calls, fetch } = spyFetch({ status: 200 })
  /** @type {object[]} */
  const logged = []

  await createGa({
    config: { ...CONFIG, debug: true },
    secret: SECRET,
    fetch,
    logger: { error: () => {}, info: (details) => logged.push(details) },
  }).send('juego_shown', { familyId: 'family-1' })

  assert.equal(calls[0].url.pathname, '/debug/mp/collect')
  assert.equal(logged.length, 1, 'what Google says about the payload is logged')
})
