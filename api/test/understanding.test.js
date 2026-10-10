import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { LONG_TEXT } from '../src/http/schemas.js'
import { signUpAs, startApi } from './helpers.js'

// The design brief's example paragraph.
const TEXT =
  'Somos Alex y Caro, tenemos a Milán, de dos años, y a Inca, nuestra mascota. A Milán le encantan los dinosaurios y los caballos, y tiene un tren de madera que no suelta.'

/** @param {object} overrides */
const answer = (overrides = {}) =>
  JSON.stringify({
    kids: [{ name: 'Milán', ageMonths: 26 }],
    pets: [{ name: 'Inca' }],
    interests: ['los dinosaurios', 'los caballos'],
    toys: ['un tren de madera'],
    unsure: [],
    note: null,
    ...overrides,
  })

/** A model that gives one fixed answer and remembers what it was asked. @param {string} reply */
const fakeLlm = (reply) => {
  /** @type {{ system: string, user: string, data?: string }[]} */
  const calls = []
  return {
    calls,
    /** @param {{ system: string, user: string, data?: string }} call */
    async *stream({ system, user, data }) {
      calls.push({ system, user, data })
      yield reply.slice(0, 10)
      yield reply.slice(10)
    },
  }
}

/** @type {Awaited<ReturnType<typeof startApi>>} */
let api
/** @type {ReturnType<typeof fakeLlm>} */
let llm = fakeLlm(answer())
before(async () => {
  api = await startApi({ llm })
})
after(() => api.close())

/** @param {string | undefined} cookie @param {object} payload */
const understand = (cookie, payload) =>
  api.app.inject({ method: 'POST', url: '/family/understanding', headers: cookie ? { cookie } : {}, payload })

test('the endpoint sends the text to the model and returns the family, without saving it', async () => {
  const { cookie } = await signUpAs(api, 'ana@example.com')
  const response = await understand(cookie, { text: TEXT })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().family.kids[0].name, 'Milán')
  assert.deepEqual(response.json().unsure, [])

  const [call] = llm.calls
  assert.equal(call.data, TEXT, "the parent's words go as data, never as instructions (JUG-90)")
  assert.match(call.system, /Solo extraés lo que el texto dice/)

  const saved = await api.app.inject({ method: 'GET', url: '/family', headers: { cookie } })
  assert.equal(saved.statusCode, 404, 'nothing is saved until the parent confirms')
  const { rows } = await api.pool.query('select count(*)::int as families from families')
  assert.equal(rows[0].families, 0)
})

test('the endpoint needs a session and some text', async () => {
  assert.equal((await understand(undefined, { text: TEXT })).statusCode, 401)
  const { cookie } = await signUpAs(api, 'beto@example.com')
  assert.equal((await understand(cookie, { text: '' })).statusCode, 400)
})

test('the text can run to five minutes of talking, and no further', async () => {
  const { cookie } = await signUpAs(api, 'eva@example.com')
  const long = TEXT.repeat(Math.ceil(LONG_TEXT / TEXT.length)).slice(0, LONG_TEXT)
  assert.equal((await understand(cookie, { text: long })).statusCode, 200)
  assert.equal((await understand(cookie, { text: `${long}.` })).statusCode, 400)
})

test('an answer with no family is a failure that keeps the text out of the reply', async () => {
  const other = await startApi({ llm: fakeLlm(`No sé. ${TEXT}`) })
  try {
    const { cookie } = await signUpAs(other, 'dani@example.com')
    const response = await other.app.inject({ method: 'POST', url: '/family/understanding', headers: { cookie }, payload: { text: TEXT } })
    assert.equal(response.statusCode, 500)
    assert.deepEqual(response.json(), { error: 'internal error' })
  } finally {
    await other.close()
  }
})

test('/me says whether a family can start from text, and without an LLM the endpoint refuses', async () => {
  const { cookie } = await signUpAs(api, 'carla@example.com')
  const me = await api.app.inject({ method: 'GET', url: '/me', headers: { cookie } })
  assert.equal(me.json().familyFromText, true)

  // The same database and session, with no LLM configured.
  const noLlm = buildApp({ config: api.config, db: api.db, logger: false, llm: null })
  try {
    const meWithout = await noLlm.inject({ method: 'GET', url: '/me', headers: { cookie } })
    assert.equal(meWithout.json().familyFromText, false)
    const refused = await noLlm.inject({ method: 'POST', url: '/family/understanding', headers: { cookie }, payload: { text: TEXT } })
    assert.equal(refused.statusCode, 503, 'a server with no LLM says the feature is off, not that it failed')
    assert.equal(refused.json().code, 'LLM_OFF')
  } finally {
    await noLlm.close()
  }
})
