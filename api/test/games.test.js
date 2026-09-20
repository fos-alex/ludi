import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createCatalogService } from '../src/catalog/catalog.service.js'
import { SOUND_SETS } from '../src/games/sounds.js'
import { EXAMPLE_PROFILE, putFamily, signUpAs, startApi } from './helpers.js'

/** ¿Qué suena? with the farm animals, as the catalog seed has it. */
const GRANJA = {
  slug: 'que-suena-granja',
  title: '¿Qué suena? Animales de la granja',
  minutes: 10,
  place: /** @type {const} */ ('indoor'),
  minAgeMonths: 12,
  maxAgeMonths: 71,
  energy: /** @type {const} */ ('low'),
  categories: ['explore', 'learn'],
  smallSpace: true,
  materials: [],
  themes: ['animales'],
  skills: ['escuchar'],
  safety: [],
  game: { type: /** @type {const} */ ('sounds'), set: 'granja' },
  why: 'Porque sí.',
  needs: 'el teléfono con volumen.',
  steps: ['Tocá Empezar.'],
  easier: 'Más fácil.',
  harder: 'Más difícil.',
}

/** @type {Awaited<ReturnType<typeof startApi>>} */
let api
/** @type {import('../src/catalog/catalog.service.js').CatalogService} */
let catalog
before(async () => {
  api = await startApi()
  catalog = createCatalogService({ db: api.db })
  await catalog.addActivityTemplate(GRANJA)
})
after(() => api.close())

/** @param {string} cookie */
const suggest = (cookie) => api.app.inject({ method: 'POST', url: '/activities/suggestions', headers: { cookie }, payload: {} })

test('a ¿Qué suena? juego comes with its game dealt for the kids playing, and saved (JUG-177)', async () => {
  const { cookie } = await signUpAs(api, 'ana@example.com')
  // Milán is 26 months, so three options a round; Inca is a dog, and the percherón a horse.
  await putFamily(api, cookie, EXAMPLE_PROFILE)

  const response = await suggest(cookie)
  assert.equal(response.statusCode, 201)
  const { id, game } = response.json()
  assert.equal(game.type, 'sounds')
  assert.equal(game.set, 'granja')
  assert.equal(game.rounds.length, 5)
  for (const round of game.rounds) {
    assert.equal(round.options.length, 3)
    assert.ok([0, 1, 2].includes(round.answer))
    if (round.sound === 'perro') assert.equal(round.options[round.answer], 'Inca')
    if (round.sound === 'caballo') assert.equal(round.options[round.answer], 'el caballo percherón')
  }

  const { rows } = await api.pool.query('select game from activities where id = $1', [id])
  assert.deepEqual(rows[0].game, game)
})

test('an ordinary juego has no game', async () => {
  await catalog.addActivityTemplate({ ...GRANJA, slug: 'sin-juego', title: 'Sin juego', game: null, active: true })
  await api.pool.query("update activity_templates set active = false where slug = 'que-suena-granja'")
  try {
    const { cookie } = await signUpAs(api, 'beto@example.com')
    await putFamily(api, cookie, EXAMPLE_PROFILE)
    const activity = (await suggest(cookie)).json()
    assert.equal(activity.title, 'Sin juego')
    assert.equal(activity.game, null)
  } finally {
    await api.pool.query("update activity_templates set active = true where slug = 'que-suena-granja'")
    await api.pool.query("update activity_templates set active = false where slug = 'sin-juego'")
  }
})

test('the catalog refuses a game that does not exist', async () => {
  await assert.rejects(
    catalog.addActivityTemplate({ ...GRANJA, slug: 'que-suena-dinos', game: { type: 'sounds', set: 'dinosaurios' } }),
    { code: 'UNKNOWN_GAME' },
  )
})

test('a sound is served to a signed-in adult, and nothing else is', async () => {
  const { cookie } = await signUpAs(api, 'carla@example.com')
  const sound = await api.app.inject({ method: 'GET', url: '/sounds/granja/vaca.mp3', headers: { cookie } })
  assert.equal(sound.statusCode, 200)
  assert.equal(sound.headers['content-type'], 'audio/mpeg')
  assert.ok(sound.rawPayload.length > 1000)

  const anonymous = await api.app.inject({ method: 'GET', url: '/sounds/granja/vaca.mp3' })
  assert.equal(anonymous.statusCode, 401)

  for (const url of ['/sounds/granja/dinosaurio.mp3', '/sounds/selva/vaca.mp3']) {
    const response = await api.app.inject({ method: 'GET', url, headers: { cookie } })
    assert.equal(response.statusCode, 404, url)
  }
  for (const url of ['/sounds/granja/credits.json', '/sounds/granja/..%2Fcredits.json']) {
    const response = await api.app.inject({ method: 'GET', url, headers: { cookie } })
    assert.equal(response.statusCode, 400, url)
  }
})

test('every sound of every set is served (JUG-179 to JUG-185)', async () => {
  const { cookie } = await signUpAs(api, 'dani@example.com')
  for (const set of SOUND_SETS) {
    for (const item of set.items) {
      const url = `/sounds/${set.key}/${item.key}.mp3`
      const sound = await api.app.inject({ method: 'GET', url, headers: { cookie } })
      assert.equal(sound.statusCode, 200, url)
      assert.equal(sound.headers['content-type'], 'audio/mpeg', url)
    }
  }
})
