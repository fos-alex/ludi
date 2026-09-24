import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { DEFAULT_WEIGHTS } from '../src/activities/ranking.js'
import { createCatalogService } from '../src/catalog/catalog.service.js'
import { seededRandom } from '../src/catalog/slots.js'
import { LIMITS } from '../src/weather/conditions.js'
import { EXAMPLE_PROFILE, putFamily, signUpAs, startApi } from './helpers.js'

/** @param {Partial<import('../src/catalog/catalog.service.js').ActivityTemplateInput>} overrides */
const template = (overrides) => ({
  slug: 'test',
  title: 'Juego',
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
  ...overrides,
})

const TEMPLATES = [
  template({
    slug: 'la-busqueda',
    title: 'La búsqueda de {toy}',
    needs: '{toy} y un almohadón.',
    steps: ['Escondé {toy} mientras {kid} mira.', 'Busquen juntos.'],
  }),
  template({ slug: 'con-la-mascota', title: 'A correr con {pet}' }),
  template({ slug: 'para-grandes', title: 'Para grandes', minAgeMonths: 60, maxAgeMonths: 95 }),
  template({ slug: 'a-comer', title: '{toy} tiene hambre' }),
  template({ slug: 'juntos', title: 'Juntos con {pet}', minAgeMonths: 12, maxAgeMonths: 71 }),
]

/** @type {Awaited<ReturnType<typeof startApi>>} */
let api
/** @type {import('../src/catalog/catalog.service.js').CatalogService} */
let catalog
before(async () => {
  api = await startApi()
  catalog = createCatalogService({ db: api.db })
  for (const each of TEMPLATES) await catalog.addActivityTemplate(each)
})
after(() => api.close())

/** @param {string} cookie @param {string | null} [afterId] */
const suggest = (cookie, afterId = null) =>
  api.app.inject({ method: 'POST', url: '/activities/suggestions', headers: { cookie }, payload: { after: afterId } })

test('a suggestion is a template filled with the family words, and it is saved', async () => {
  const { cookie } = await signUpAs(api, 'ana@example.com')
  await putFamily(api, cookie, { ...EXAMPLE_PROFILE, pets: [], toys: [{ name: 'el dinosaurio chiquito' }] })

  const response = await suggest(cookie)
  assert.equal(response.statusCode, 201)
  const activity = response.json()
  assert.doesNotMatch(JSON.stringify(activity), /\{(kid|pet|toy2?3?|interest)\}/)
  assert.ok(['La búsqueda del dinosaurio chiquito', 'El dinosaurio chiquito tiene hambre'].includes(activity.title))
  assert.equal(activity.place, 'indoor')
  assert.equal(activity.reaction, null)

  // Saved as the parent saw it, with why the ranking picked it (JUG-104).
  const { rows } = await api.pool.query('select title, pick from activities where id = $1', [activity.id])
  assert.equal(rows[0].title, activity.title)
  assert.ok(rows[0].pick.score > 0)
  assert.equal(rows[0].pick.fit, 1)
  assert.deepEqual(rows[0].pick.weights, DEFAULT_WEIGHTS)
})

test('templates the family cannot fill, or that are for other ages, are never suggested', async () => {
  const { cookie } = await signUpAs(api, 'beto@example.com')
  await putFamily(api, cookie, { ...EXAMPLE_PROFILE, pets: [] })

  let previous = null
  for (let round = 0; round < 8; round++) {
    const activity = (await suggest(cookie, previous)).json()
    assert.doesNotMatch(activity.title, /correr|grandes/)
    previous = activity.id
  }
})

test('another suggestion moves on to a different template', async () => {
  const { cookie } = await signUpAs(api, 'carla@example.com')
  await putFamily(api, cookie, EXAMPLE_PROFILE)

  const first = (await suggest(cookie)).json()
  const next = (await suggest(cookie, first.id)).json()
  assert.notEqual(next.id, first.id)
  assert.notEqual(next.title, first.title)
})

test('an activity must suit every kid, not just one', async () => {
  const { cookie } = await signUpAs(api, 'fede@example.com')
  await putFamily(api, cookie, {
    ...EXAMPLE_PROFILE,
    kids: [
      { name: 'Milán', ageMonths: 12 },
      { name: 'Sofi', ageMonths: 52 },
    ],
  })

  // Only "juntos" (12 to 71 months) covers both a 1-year-old and a 4-year-old.
  let previous = null
  for (let round = 0; round < 4; round++) {
    const activity = (await suggest(cookie, previous)).json()
    assert.equal(activity.title, 'Juntos con Inca')
    previous = activity.id
  }
})

test('when nothing in the catalog fits, it says so with a code', async () => {
  const { cookie } = await signUpAs(api, 'dani@example.com')
  await putFamily(api, cookie, { ...EXAMPLE_PROFILE, kids: [{ name: 'Sofi', ageMonths: 144 }] })
  const response = await suggest(cookie)
  assert.equal(response.statusCode, 404)
  assert.equal(response.json().code, 'NO_FITTING_ACTIVITY')
})

test('suggestions need a family', async () => {
  const { cookie } = await signUpAs(api, 'eva@example.com')
  const response = await suggest(cookie)
  assert.equal(response.statusCode, 409)
  assert.deepEqual(response.json(), { error: 'family required' })
})

test('a juego suits only the kids playing, names them, and records who played', async () => {
  await catalog.addActivityTemplate(template({ slug: 'para-cuatro', title: '{kid} arma una torre', minAgeMonths: 36, maxAgeMonths: 71 }))
  const { cookie } = await signUpAs(api, 'gabi@example.com')
  const profile = (
    await putFamily(api, cookie, {
      ...EXAMPLE_PROFILE,
      kids: [
        { name: 'Milán', ageMonths: 12 },
        { name: 'Sofi', ageMonths: 52 },
      ],
    })
  ).json()
  const sofi = profile.kids[1]
  await api.app.inject({ method: 'PUT', url: '/family/playing', headers: { cookie }, payload: { kids: [sofi.id] } })

  // Without Milán (1), a 4-year-old's juegos open up: "para-cuatro" (36 to 71 months) as well as "juntos".
  const titles = new Set()
  let previous = null
  for (let round = 0; round < 4; round++) {
    const activity = (await suggest(cookie, previous)).json()
    titles.add(activity.title)
    previous = activity.id
  }
  assert.deepEqual([...titles].sort(), ['Juntos con Inca', 'Sofi arma una torre'])
  const { rows } = await api.pool.query('select kid_ids::text[] as kids from activities where id = $1', [previous])
  assert.deepEqual(rows[0].kids, [sofi.id])
})

test('{interest} is something the kid named loves, and only the kids playing count (JUG-144)', async () => {
  await catalog.addActivityTemplate(
    template({
      slug: 'lo-que-le-encanta',
      title: 'Lo que le encanta a {kid}',
      harder: 'Sumen cosas que le encantan a {kid}, como {interest}.',
      minAgeMonths: 12,
      maxAgeMonths: 71,
    }),
  )
  const { cookie } = await signUpAs(api, 'hugo@example.com')
  const profile = (
    await putFamily(api, cookie, {
      ...EXAMPLE_PROFILE,
      kids: [
        { name: 'Milán', ageMonths: 26, interests: ['los dinosaurios'] },
        { name: 'Sofi', ageMonths: 52, interests: ['dibujar'] },
      ],
    })
  ).json()
  await api.app.inject({ method: 'PUT', url: '/family/playing', headers: { cookie }, payload: { kids: [profile.kids[1].id] } })

  /** @type {{ title: string, harder: string } | null} */
  let found = null
  let previous = null
  for (let round = 0; round < 6 && !found; round++) {
    const activity = (await suggest(cookie, previous)).json()
    if (activity.title === 'Lo que le encanta a Sofi') found = activity
    previous = activity.id
  }
  assert.equal(found?.harder, 'Sumen cosas que le encantan a Sofi, como dibujar.')
})

test('a juego never needs a material the family does not have, and the common ones count as there (JUG-153)', async () => {
  await catalog.addActivityTemplate(template({ slug: 'con-tizas', title: 'Con tizas', minAgeMonths: 96, maxAgeMonths: 119, materials: ['tizas'] }))
  await catalog.addActivityTemplate(
    template({ slug: 'con-almohadones', title: 'Con almohadones', minAgeMonths: 96, maxAgeMonths: 119, materials: ['almohadones'] }),
  )
  const { cookie } = await signUpAs(api, 'ines@example.com')
  await putFamily(api, cookie, { ...EXAMPLE_PROFILE, pets: [], toys: [], kids: [{ name: 'Sofi', ageMonths: 100 }] })

  /** The titles of a few suggestions in a row. */
  const titles = async () => {
    const seen = new Set()
    let previous = null
    for (let round = 0; round < 6; round++) {
      const activity = (await suggest(cookie, previous)).json()
      seen.add(activity.title)
      previous = activity.id
    }
    return [...seen].sort()
  }
  /** @param {string} key @param {boolean} have */
  const mark = (key, have) => api.app.inject({ method: 'PUT', url: `/family/materials/${key}`, headers: { cookie }, payload: { have } })

  // Tizas start off and almohadones on. No other template is for an 8-year-old.
  assert.deepEqual(await titles(), ['Con almohadones'])
  await mark('tizas', true)
  assert.deepEqual(await titles(), ['Con almohadones', 'Con tizas'])
  await mark('almohadones', false)
  assert.deepEqual(await titles(), ['Con tizas'])
})

/** @param {string} cookie @param {string} id @param {unknown} reaction */
const react = (cookie, id, reaction) =>
  api.app.inject({ method: 'PUT', url: `/activities/${id}/reaction`, headers: { cookie }, payload: { reaction } })

test('the feedback tap saves one reaction per juego, which the parent can change or take back (JUG-23)', async () => {
  const { cookie } = await signUpAs(api, 'juan@example.com')
  await putFamily(api, cookie, EXAMPLE_PROFILE)
  const activity = (await suggest(cookie)).json()

  let response = await react(cookie, activity.id, 'up')
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { id: activity.id, reaction: 'up' })
  let { rows } = await api.pool.query('select reaction, reacted_at from activities where id = $1', [activity.id])
  assert.equal(rows[0].reaction, 'up')
  assert.ok(rows[0].reacted_at)

  response = await react(cookie, activity.id, 'down')
  assert.deepEqual(response.json(), { id: activity.id, reaction: 'down' })

  response = await react(cookie, activity.id, null)
  assert.deepEqual(response.json(), { id: activity.id, reaction: null })
  ;({ rows } = await api.pool.query('select reaction, reacted_at from activities where id = $1', [activity.id]))
  assert.equal(rows[0].reaction, null)
  assert.equal(rows[0].reacted_at, null)

  assert.equal((await react(cookie, activity.id, 'meh')).statusCode, 400)
  assert.equal((await react(cookie, activity.id, undefined)).statusCode, 400)
})

test('a reaction goes only on the family own juegos', async () => {
  const { cookie } = await signUpAs(api, 'kari@example.com')
  await putFamily(api, cookie, EXAMPLE_PROFILE)
  const { cookie: other } = await signUpAs(api, 'lola@example.com')
  await putFamily(api, other, EXAMPLE_PROFILE)
  const activity = (await suggest(cookie)).json()

  assert.equal((await react(other, activity.id, 'up')).statusCode, 404)
  assert.equal((await react(cookie, '00000000-0000-0000-0000-000000000000', 'up')).statusCode, 404)
  assert.equal((await react(cookie, 'not-a-uuid', 'up')).statusCode, 400)
  const noFamily = (await signUpAs(api, 'nico@example.com')).cookie
  assert.equal((await react(noFamily, activity.id, 'up')).statusCode, 409)
  assert.equal((await api.app.inject({ method: 'PUT', url: `/activities/${activity.id}/reaction`, payload: { reaction: 'up' } })).statusCode, 401)
})

test('a juego marked "No era para nosotros" stops showing up, and one about what the kid loves says so in its pick (JUG-104)', async () => {
  await catalog.addActivityTemplate(
    template({ slug: 'con-dinos', title: 'Rugidos de dinosaurio', minAgeMonths: 12, maxAgeMonths: 47, themes: ['dinosaurios'] }),
  )
  const { cookie } = await signUpAs(api, 'mati@example.com')
  await putFamily(api, cookie, { ...EXAMPLE_PROFILE, pets: [], toys: [{ name: 'el dinosaurio chiquito' }] })

  // Down the first juego the family gets that isn't the dinosaur one.
  let first = (await suggest(cookie)).json()
  while (first.title === 'Rugidos de dinosaurio') first = (await suggest(cookie, first.id)).json()
  await react(cookie, first.id, 'down')

  const titles = new Set()
  let previous = first.id
  let dinos = null
  for (let round = 0; round < 12; round++) {
    const activity = (await suggest(cookie, previous)).json()
    titles.add(activity.title)
    if (activity.title === 'Rugidos de dinosaurio') dinos = activity
    previous = activity.id
  }
  assert.ok(!titles.has(first.title), `${first.title} came back`)
  assert.ok(dinos, 'the dinosaur juego never came')
  const { rows } = await api.pool.query('select pick from activities where id = $1', [dinos.id])
  assert.deepEqual(rows[0].pick.themes, ['dinosaurios'])
  assert.equal(rows[0].pick.fit, 1 + DEFAULT_WEIGHTS.interest)
})

test('a juego before bed is calm, and the parent can ask for one con pilas (JUG-26)', async () => {
  // Its own catalog and its own clock: 21:00 in Buenos Aires, whatever the server is set to.
  const evening = await startApi({ now: () => new Date('2026-09-14T21:00:00-03:00'), random: seededRandom('noche') })
  try {
    const eveningCatalog = createCatalogService({ db: evening.db })
    await eveningCatalog.addActivityTemplate(template({ slug: 'tranqui', title: 'Un juego tranqui', energy: 'low' }))
    await eveningCatalog.addActivityTemplate(template({ slug: 'con-pilas', title: 'Un juego con pilas', energy: 'high' }))
    /** @param {string} cookie @param {{ mood?: 'calm' | 'lively' | null }} [body] */
    const ask = (cookie, body = {}) =>
      evening.app.inject({ method: 'POST', url: '/activities/suggestions', headers: { cookie }, payload: body })
    /** @param {string} id */
    const pickOf = async (id) => (await evening.pool.query('select pick from activities where id = $1', [id])).rows[0].pick

    // Saying nothing leaves it to the clock, so an old client still gets a calm juego.
    const { cookie } = await signUpAs(evening, 'noche@example.com')
    await putFamily(evening, cookie, { ...EXAMPLE_PROFILE, pets: [], toys: [] })
    const calm = (await ask(cookie)).json()
    assert.equal(calm.title, 'Un juego tranqui')
    assert.equal((await pickOf(calm.id)).mood, 'calm')

    // The parent who says they have pilas gets the energetic one instead.
    const { cookie: other } = await signUpAs(evening, 'pilas@example.com')
    await putFamily(evening, other, { ...EXAMPLE_PROFILE, pets: [], toys: [] })
    const lively = (await ask(other, { mood: 'lively' })).json()
    assert.equal(lively.title, 'Un juego con pilas')
    assert.equal((await pickOf(lively.id)).mood, 'lively')

    // No preference leaves every template where it was.
    const { cookie: either } = await signUpAs(evening, 'igual@example.com')
    await putFamily(evening, either, { ...EXAMPLE_PROFILE, pets: [], toys: [] })
    const anytime = (await ask(either, { mood: null })).json()
    const pick = await pickOf(anytime.id)
    assert.equal(pick.mood, null)
    assert.equal(pick.moment, 1)

    assert.equal((await ask(cookie, /** @type {any} */ ({ mood: 'dormido' }))).statusCode, 400)
  } finally {
    await evening.close()
  }
})

test('the parent can ask for a juego outside, with sound, or of a kind, and gets the closest when none is all of it (JUG-31)', async () => {
  const choosing = await startApi({ now: () => new Date('2026-09-14T15:00:00-03:00'), random: seededRandom('elegir') })
  try {
    const choosingCatalog = createCatalogService({ db: choosing.db })
    await choosingCatalog.addActivityTemplate(template({ slug: 'crear', title: 'Crear adentro', categories: ['create'] }))
    await choosingCatalog.addActivityTemplate(
      template({ slug: 'plaza', title: 'Correr en la plaza', place: 'outdoor', categories: ['move', 'out_and_about'] }),
    )
    await choosingCatalog.addActivityTemplate(
      template({ slug: 'que-suena', title: '¿Qué suena?', categories: ['learn'], game: { type: 'sounds', set: 'granja' } }),
    )
    const { cookie } = await signUpAs(choosing, 'elegir@example.com')
    await putFamily(choosing, cookie, { ...EXAMPLE_PROFILE, pets: [], toys: [] })
    /** @param {object} body */
    const ask = (body) =>
      choosing.app.inject({ method: 'POST', url: '/activities/suggestions', headers: { cookie }, payload: body })
    /** @param {string} id */
    const pickOf = async (id) => (await choosing.pool.query('select pick from activities where id = $1', [id])).rows[0].pick

    const outside = (await ask({ place: 'outdoor' })).json()
    assert.equal(outside.title, 'Correr en la plaza')
    assert.equal(outside.closest, false)
    assert.deepEqual((await pickOf(outside.id)).choices, { place: 'outdoor', sound: null, category: null })

    const sound = (await ask({ sound: true })).json()
    assert.equal(sound.title, '¿Qué suena?')
    assert.equal(sound.game.type, 'sounds')

    const quietCraft = (await ask({ sound: false, category: 'create' })).json()
    assert.equal(quietCraft.title, 'Crear adentro')

    // Nothing outside plays sound, so the juego is one of the two that come closest, and says so.
    const closest = (await ask({ place: 'outdoor', sound: true })).json()
    assert.ok(['Correr en la plaza', '¿Qué suena?'].includes(closest.title), closest.title)
    assert.equal(closest.closest, true)
    assert.equal((await pickOf(closest.id)).closest, true)

    // Choosing nothing leaves every juego in, as before.
    assert.equal((await ask({})).json().closest, false)

    assert.equal((await ask({ category: 'volar' })).statusCode, 400)
    assert.equal((await ask({ place: 'la luna' })).statusCode, 400)
  } finally {
    await choosing.close()
  }
})

test('a fine afternoon brings a juego outside, and rain and the night keep it in (JUG-25, JUG-191)', async () => {
  /** A forecaster that answers the same hour all the way through, and counts its calls. */
  const forecasting = (/** @type {object} */ hour) => {
    /** @type {{ latitude: number, longitude: number }[]} */
    const reads = []
    return {
      reads,
      /** @param {{ latitude: number, longitude: number }} place */
      async read(place) {
        reads.push(place)
        return { hours: Array.from({ length: LIMITS.hours }, () => hour) }
      },
    }
  }
  const CLEAR = { temperature: 22, rain: 0, rainChance: 0, wind: 12, code: 0 }
  const POURING = { temperature: 18, rain: 2, rainChance: 90, wind: 20, code: 61 }
  const geocoder = { async locate() {
    return { latitude: -34.61315, longitude: -58.37723 }
  } }

  /** @param {object} hour @param {string} [at] the time in Buenos Aires */
  const askWith = async (hour, at = '2026-09-14T15:00:00-03:00') => {
    const forecaster = forecasting(hour)
    // Midday by default, so the moment leaves both juegos where they are.
    const weather = await startApi({
      forecaster,
      geocoder,
      now: () => new Date(at),
      random: seededRandom('tiempo'),
    })
    try {
      const catalog = createCatalogService({ db: weather.db })
      await catalog.addActivityTemplate(template({ slug: 'adentro', title: 'Un juego adentro', place: 'indoor' }))
      await catalog.addActivityTemplate(template({ slug: 'afuera', title: 'Un juego afuera', place: 'outdoor' }))
      const { cookie } = await signUpAs(weather, `tiempo-${hour.code}@example.com`)
      await putFamily(weather, cookie, { ...EXAMPLE_PROFILE, pets: [], toys: [], location: 'Capital Federal' })

      const suggested = (
        await weather.app.inject({ method: 'POST', url: '/activities/suggestions', headers: { cookie }, payload: {} })
      ).json()
      const { rows } = await weather.pool.query('select pick from activities where id = $1', [suggested.id])
      // What Home shows, from the same cache entry.
      const outside = (await weather.app.inject({ method: 'GET', url: '/activities/weather', headers: { cookie } })).json()
      return { suggested, pick: rows[0].pick, reads: forecaster.reads, outside }
    } finally {
      await weather.close()
    }
  }

  const fine = await askWith(CLEAR)
  assert.equal(fine.suggested.title, 'Un juego afuera')
  assert.deepEqual(fine.pick.conditions, { weather: 'fine', reason: 'clear' })
  // The forecast is asked for where the geocoder put the family, not for a home.
  assert.deepEqual(fine.reads, [{ latitude: -34.61315, longitude: -58.37723 }])
  assert.deepEqual(fine.outside, { weather: 'fine', reason: 'clear', night: false })

  const wet = await askWith(POURING)
  assert.equal(wet.suggested.title, 'Un juego adentro')
  assert.deepEqual(wet.pick.conditions, { weather: 'poor', reason: 'rain' })
  assert.equal(wet.pick.weather, DEFAULT_WEIGHTS.weather.poor.indoor)
  assert.deepEqual(wet.outside, { weather: 'poor', reason: 'rain', night: false })

  // A clear night still keeps the juego at home, and Home is told it is night.
  const night = await askWith(CLEAR, '2026-09-14T21:00:00-03:00')
  assert.equal(night.suggested.title, 'Un juego adentro')
  assert.equal(night.pick.night, true)
  assert.deepEqual(night.outside, { weather: 'fine', reason: 'clear', night: true })
})

test('a family that has not said where they live is offered a juego as before (JUG-25)', async () => {
  const forecaster = {
    async read() {
      throw new Error('nobody should be asked without a place')
    },
  }
  const nowhere = await startApi({ forecaster, now: () => new Date('2026-09-14T15:00:00-03:00') })
  try {
    const catalog = createCatalogService({ db: nowhere.db })
    await catalog.addActivityTemplate(template({ slug: 'adentro', title: 'Un juego adentro', place: 'indoor' }))
    const { cookie } = await signUpAs(nowhere, 'sinlugar@example.com')
    await putFamily(nowhere, cookie, { ...EXAMPLE_PROFILE, pets: [], toys: [] })

    const suggested = (
      await nowhere.app.inject({ method: 'POST', url: '/activities/suggestions', headers: { cookie }, payload: {} })
    ).json()
    assert.equal(suggested.title, 'Un juego adentro')
    const { rows } = await nowhere.pool.query('select pick from activities where id = $1', [suggested.id])
    assert.equal(rows[0].pick.conditions, null)
    assert.equal(rows[0].pick.weather, 1)
    // And Home has no weather to show.
    const outside = await nowhere.app.inject({ method: 'GET', url: '/activities/weather', headers: { cookie } })
    assert.equal(outside.statusCode, 200)
    assert.equal(outside.json(), null)
  } finally {
    await nowhere.close()
  }
})

test('Jev reads whether the kids would enjoy each juego, with no names, and the pick keeps its answer (JUG-200)', async () => {
  /** @type {{ state: any, questions: Record<string, any> }[]} */
  const calls = []
  // Sure about the juego with dinosaurs, doubtful about the other.
  const jev = {
    /** @param {{ state: any, questions: Record<string, any> }} call */
    async nouls({ state, questions }) {
      calls.push({ state, questions })
      return new Map(
        Object.entries(questions).map(([key, question]) => [key, question.instructions.juego.title.includes('dinos') ? 0.95 : 0.05]),
      )
    },
  }
  const enjoying = await startApi({ jev, random: seededRandom('jev'), now: () => new Date('2026-09-14T15:00:00-03:00') })
  try {
    const catalog = createCatalogService({ db: enjoying.db })
    await catalog.addActivityTemplate(template({ slug: 'dinos', title: 'Los dinos de {kid}' }))
    await catalog.addActivityTemplate(template({ slug: 'otro', title: 'Otro juego' }))
    const { cookie } = await signUpAs(enjoying, 'jev@example.com')
    await putFamily(enjoying, cookie, { ...EXAMPLE_PROFILE, toys: [] })

    const response = await enjoying.app.inject({ method: 'POST', url: '/activities/suggestions', headers: { cookie }, payload: {} })
    assert.equal(response.statusCode, 201)
    const { rows } = await enjoying.pool.query('select pick from activities where id = $1', [response.json().id])
    assert.equal(typeof rows[0].pick.jev, 'number')
    assert.ok(rows[0].pick.enjoyment !== 1)

    // One call for both juegos, with the kid's age and interests and never a name.
    assert.equal(calls.length, 1)
    assert.equal(Object.keys(calls[0].questions).length, 2)
    assert.deepEqual(calls[0].state.kids, [{ age: '2 years and 2 months old', loves: ['los dinosaurios', 'los caballos'] }])
    const sent = JSON.stringify(calls[0])
    for (const name of ['Milán', 'Inca']) assert.ok(!sent.includes(name), name)
    assert.ok(sent.includes('Los dinos de {kid}'))
  } finally {
    await enjoying.close()
  }

  // When Jev fails, the juego is offered as before.
  const failing = await startApi({ jev: { async nouls() {
    throw new Error('down')
  } } })
  try {
    const catalog = createCatalogService({ db: failing.db })
    await catalog.addActivityTemplate(template({ slug: 'uno', title: 'Un juego' }))
    const { cookie } = await signUpAs(failing, 'jev-caido@example.com')
    await putFamily(failing, cookie, { ...EXAMPLE_PROFILE, toys: [] })
    const response = await failing.app.inject({ method: 'POST', url: '/activities/suggestions', headers: { cookie }, payload: {} })
    assert.equal(response.statusCode, 201)
    const { rows } = await failing.pool.query('select pick from activities where id = $1', [response.json().id])
    assert.equal(rows[0].pick.jev, null)
    assert.equal(rows[0].pick.enjoyment, 1)
  } finally {
    await failing.close()
  }
})
