import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { ageInWords, createEnjoyment, questionFor, stateOf } from '../../src/activities/enjoyment.js'
import { UpstreamError } from '../../src/errors.js'
import { createJev } from '../../src/jev/typesafe.js'

/** What the fake service was sent, in order. @type {{ headers: import('node:http').IncomingHttpHeaders, body: any }[]} */
let asked = []
/** How it answers the next request. @type {(response: import('node:http').ServerResponse, body: any) => void} */
let answer = () => {}

/** @type {import('node:http').Server} */
let server
/** @type {string} */
let baseUrl

before(async () => {
  server = createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk) => (raw += chunk))
    request.on('end', () => {
      const body = JSON.parse(raw)
      asked.push({ headers: request.headers, body })
      answer(response, body)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
  baseUrl = `http://127.0.0.1:${port}/v1`
})
after(() => server.close())
beforeEach(() => {
  asked = []
})

const jev = () => /** @type {import('../../src/jev/typesafe.js').Jev} */ (createJev({ config: { url: baseUrl, apiKey: 'key', model: 'jev-latest' } }))

/** Answers every question asked with the same noul, the way TypeSafe sends it. */
const everyNoul = (/** @type {number} */ noul) => (/** @type {import('node:http').ServerResponse} */ response, /** @type {any} */ body) => {
  response.writeHead(200, { 'Content-Type': 'application/json' })
  const answers = Object.fromEntries(Object.keys(body.questions).map((key) => [key, { type: 'noul', noul }]))
  response.end(JSON.stringify({ model: 'jev-1.13.0', answers, usage: { input_tokens: 10, output_tokens: 1 } }))
}

const status = (/** @type {number} */ code, body = '{"detail":"state: Milán loves dinosaurs"}') =>
  (/** @type {import('node:http').ServerResponse} */ response) => {
    response.writeHead(code, { 'Content-Type': 'application/json' })
    response.end(body)
  }

const PROFILE = /** @type {any} */ ({
  name: 'Los Otero',
  parents: [{ id: 'p', name: 'Alex', calledAs: 'Papá' }],
  kids: [
    { id: 'k1', name: 'Milán', ageMonths: 26, playing: true, interests: ['los dinosaurios'] },
    { id: 'k2', name: 'Uma', ageMonths: 14, playing: true, interests: [] },
  ],
  pets: [{ id: 'd', name: 'Inca', kind: 'dog' }],
  interests: ['los dinosaurios'],
  toys: [{ id: 't', name: 'el tren grandote', favorite: true }],
})

/** @param {string} id */
const template = (id) =>
  /** @type {any} */ ({
    id,
    slug: id,
    title: `Dinos con {kid}`,
    why: 'Porque a {kid} le encantan.',
    steps: ['Escondan a {toy}.'],
    categories: ['pretend'],
    themes: ['dinosaurios'],
    texts: [],
  })

test('without a key there is no client', () => {
  assert.equal(createJev({ config: { url: baseUrl, apiKey: null, model: 'jev-latest' } }), null)
})

test('the nouls come back by the key each question was asked under, with the key and the model sent', async () => {
  answer = everyNoul(0.8)
  const nouls = await jev().nouls({ state: { kids: [] }, questions: { a: { instructions: 'A?' }, b: { instructions: 'B?' } } })
  assert.deepEqual([...nouls], [['a', 0.8], ['b', 0.8]])
  assert.equal(asked[0].headers.authorization, 'Bearer key')
  assert.equal(asked[0].body.model, 'jev-latest')
  assert.deepEqual(asked[0].body.questions.a, { type: 'noul', instructions: 'A?' })
})

test('a failure says only the status, never what was sent or what came back', async () => {
  answer = status(422)
  await assert.rejects(jev().nouls({ state: {}, questions: { a: { instructions: 'A?' } } }), (error) => {
    assert.ok(error instanceof UpstreamError)
    assert.equal(error.message, 'Jev answered HTTP 422')
    return true
  })
  answer = status(200, '{"answers":{}}')
  await assert.rejects(jev().nouls({ state: {}, questions: { a: { instructions: 'A?' } } }), UpstreamError)
})

test('the state holds only the ages and what the kids love, and the questions only the templates with their slots unfilled', () => {
  const state = stateOf(PROFILE)
  assert.deepEqual(state.kids, [
    { age: '2 years and 2 months old', loves: ['los dinosaurios'] },
    { age: '14 months old', loves: [] },
  ])
  const sent = JSON.stringify({ state, question: questionFor(template('a')) })
  for (const name of ['Milán', 'Uma', 'Inca', 'Alex', 'Papá', 'Otero', 'tren grandote']) assert.ok(!sent.includes(name), name)
  assert.ok(sent.includes('{kid}'))
})

test('ages are in words', () => {
  assert.equal(ageInWords(null), 'not given')
  assert.equal(ageInWords(18), '18 months old')
  assert.equal(ageInWords(36), '3 years old')
  assert.equal(ageInWords(41), '3 years and 5 months old')
})

test('enjoyment is one call for every template, by template id', async () => {
  answer = everyNoul(0.7)
  const enjoyment = createEnjoyment({ jev: jev() })
  const byTemplate = await enjoyment.of(PROFILE, [template('a'), template('b')])
  assert.deepEqual(byTemplate && [...byTemplate], [['a', 0.7], ['b', 0.7]])
  assert.equal(asked.length, 1)
})

test('enjoyment never fails a juego: no Jev, an error, and a slow answer are all null', async () => {
  assert.equal(await createEnjoyment({ jev: null }).of(PROFILE, [template('a')]), null)

  /** @type {string[]} */
  const warnings = []
  const logger = { warn: (/** @type {string} */ message) => warnings.push(message) }
  answer = status(500)
  assert.equal(await createEnjoyment({ jev: jev(), logger }).of(PROFILE, [template('a')]), null)
  assert.equal(warnings.length, 1)
  assert.ok(!warnings[0].includes('Milán'))

  // Past the timeout the juego goes without it.
  answer = (response, body) => setTimeout(() => everyNoul(0.5)(response, body), 2500)
  const started = Date.now()
  assert.equal(await createEnjoyment({ jev: jev(), logger }).of(PROFILE, [template('a')]), null)
  assert.ok(Date.now() - started < 2400)
})
