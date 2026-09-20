import assert from 'node:assert/strict'
import { test } from 'node:test'
import { betaSample, DEFAULT_WEIGHTS, jaccard, priorOf, rank, ratingNow } from '../../src/activities/ranking.js'
import { seededRandom } from '../../src/catalog/slots.js'

const NOW = new Date('2026-09-16T15:00:00Z')
const DAY = 86_400_000

/** @param {Partial<import('../../src/catalog/catalog.service.js').FillableActivityTemplate> & { slug: string }} overrides */
const template = (overrides) => ({
  id: overrides.slug,
  title: overrides.slug,
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
  why: '',
  needs: '',
  steps: ['Jueguen.'],
  easier: '',
  harder: '',
  active: true,
  rating: 3,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  texts: [overrides.slug],
  ...overrides,
})

/** A candidate with the plainest fill. @param {ReturnType<typeof template>} each */
const candidate = (each, fill = { kid: 'Milán', toy: 'la pelota' }) => ({ template: each, fill })

/** @param {Partial<Parameters<typeof rank>[1]>} [overrides] */
const context = (overrides) => ({
  interestThemes: [],
  favoriteToys: [],
  history: [],
  others: new Map(),
  catalog: [],
  now: NOW,
  random: seededRandom('ranking'),
  ...overrides,
})

/** @param {Date} when @param {'up' | 'down' | null} [reaction] */
const seen = (/** @type {string} */ templateId, when, reaction = null) => ({ templateId, createdAt: when, reaction })
/** @param {number} days */
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY)

/**
 * How often a slug wins over many seeds, from 0 to 1.
 * @param {ReturnType<typeof candidate>[]} candidates
 * @param {Partial<Parameters<typeof rank>[1]>} overrides
 * @param {string} slug
 */
function winRate(candidates, overrides, slug, rounds = 200) {
  let wins = 0
  for (let round = 0; round < rounds; round++) {
    const [first] = rank(candidates, context({ ...overrides, random: seededRandom(`round-${round}`) }))
    if (first.template.slug === slug) wins++
  }
  return wins / rounds
}

test('the ranking is deterministic for a seed, and different across seeds', () => {
  const candidates = ['a', 'b', 'c', 'd'].map((slug) => candidate(template({ slug })))
  const order = () => rank(candidates, context({ random: seededRandom('one') })).map((each) => each.template.slug)
  assert.deepEqual(order(), order())
  const other = rank(candidates, context({ random: seededRandom('two') })).map((each) => each.template.slug)
  assert.notDeepEqual(order(), other)
})

test('a template about something a kid loves gains, and the pick says which themes', () => {
  const dinos = candidate(template({ slug: 'dinos', themes: ['dinosaurios', 'animales'] }))
  const plain = candidate(template({ slug: 'plain', themes: ['agua'] }))
  const ranked = rank([plain, dinos], context({ interestThemes: ['dinosaurios'] }))
  const pick = (/** @type {string} */ slug) => /** @type {any} */ (ranked.find((each) => each.template.slug === slug)).pick
  assert.equal(pick('dinos').fit, 1 + DEFAULT_WEIGHTS.interest)
  assert.deepEqual(pick('dinos').themes, ['dinosaurios'])
  assert.equal(pick('plain').fit, 1)
  assert.deepEqual(pick('plain').themes, [])
  assert.ok(winRate([plain, dinos], { interestThemes: ['dinosaurios'] }, 'dinos') > 0.8)
})

test('a template that names an interest gains, and one that drew a favorite toy gains', () => {
  const named = candidate(template({ slug: 'named', texts: ['Cosas como {interest}'] }))
  const favorite = candidate(template({ slug: 'favorite' }), { kid: 'Milán', toy: 'el osito' })
  const plain = candidate(template({ slug: 'plain' }))
  const ranked = rank([plain, named, favorite], context({ favoriteToys: ['el osito'] }))
  const pick = (/** @type {string} */ slug) => /** @type {any} */ (ranked.find((each) => each.template.slug === slug)).pick
  assert.equal(pick('named').fit, 1 + DEFAULT_WEIGHTS.named)
  assert.equal(pick('named').named, true)
  assert.equal(pick('favorite').fit, 1 + DEFAULT_WEIGHTS.favorite)
  assert.equal(pick('favorite').favorite, true)
  assert.equal(pick('plain').fit, 1)
})

test('a template the family gave a thumbs down to is out, unless nothing else is left', () => {
  const a = candidate(template({ slug: 'a' }))
  const b = candidate(template({ slug: 'b' }))
  const history = [seen('a', daysAgo(20), 'down')]
  assert.deepEqual(
    rank([a, b], context({ history })).map((each) => each.template.slug),
    ['b'],
  )
  assert.deepEqual(
    rank([a], context({ history })).map((each) => each.template.slug),
    ['a'],
  )
  // A later thumbs up on the same template lets it back in.
  const forgiven = [seen('a', daysAgo(2), 'up'), seen('a', daysAgo(20), 'down')]
  assert.equal(rank([a, b], context({ history: forgiven })).length, 2)
})

test('the juego being left is out, and what is like it loses by the similarity', () => {
  const left = template({ slug: 'left', categories: ['move'], themes: ['cuerpo'], energy: 'high' })
  const alike = candidate(template({ slug: 'alike', categories: ['move'], themes: ['cuerpo'], energy: 'high' }))
  const unlike = candidate(template({ slug: 'unlike', categories: ['create'], themes: ['dibujar'], energy: 'low' }))
  const ranked = rank([candidate(left), alike, unlike], context({ after: left }))
  assert.ok(!ranked.some((each) => each.template.slug === 'left'))
  const pick = (/** @type {string} */ slug) => /** @type {any} */ (ranked.find((each) => each.template.slug === slug)).pick
  assert.ok(pick('alike').difference < pick('unlike').difference)
  assert.equal(pick('alike').difference, 1 - DEFAULT_WEIGHTS.different * jaccard(new Set(['x']), new Set(['x'])))
  assert.ok(winRate([alike, unlike], { after: left }, 'unlike') > 0.95)
  // When it is the only one, it comes back rather than nothing.
  assert.equal(rank([candidate(left)], context({ after: left }))[0].template.slug, 'left')
})

test('a template seen lately waits, most of the way back after seenDays, and never to zero', () => {
  const fresh = candidate(template({ slug: 'fresh' }))
  const justSeen = candidate(template({ slug: 'just-seen' }))
  const oldSeen = candidate(template({ slug: 'old-seen' }))
  const history = [seen('just-seen', daysAgo(0.01)), seen('old-seen', daysAgo(30))]
  const ranked = rank([justSeen, oldSeen, fresh], context({ history }))
  const pick = (/** @type {string} */ slug) => /** @type {any} */ (ranked.find((each) => each.template.slug === slug)).pick
  assert.equal(pick('fresh').freshness, 1)
  assert.equal(pick('just-seen').freshness, DEFAULT_WEIGHTS.floor)
  assert.ok(pick('old-seen').freshness > 0.99)
  assert.ok(winRate([justSeen, fresh], { history }, 'fresh') > 0.99)
  assert.equal(rank([justSeen], context({ history }))[0].template.slug, 'just-seen')
})

test('a template the family said they played waits longer than one they only saw', () => {
  const played = candidate(template({ slug: 'played' }))
  const looked = candidate(template({ slug: 'looked' }))
  const history = [seen('played', daysAgo(4), 'up'), seen('looked', daysAgo(4))]
  const ranked = rank([played, looked], context({ history }))
  const pick = (/** @type {string} */ slug) => /** @type {any} */ (ranked.find((each) => each.template.slug === slug)).pick
  assert.ok(pick('played').freshness < pick('looked').freshness)
})

test('once a discovery game is offered, every discovery game waits on the gameDays curve (JUG-128)', () => {
  const game = (/** @type {string} */ set) => ({ type: /** @type {const} */ ('sounds'), set })
  const granja = template({ slug: 'granja', game: game('granja') })
  const barrio = template({ slug: 'barrio', game: game('barrio') })
  const juego = template({ slug: 'juego' })
  /** @param {ReturnType<typeof seen>[]} history @param {string} slug */
  const pick = (history, slug) => {
    const ranked = rank([candidate(barrio), candidate(juego)], context({ history, catalog: [granja, barrio, juego] }))
    return /** @type {any} */ (ranked.find((each) => each.template.slug === slug)).pick
  }
  // Offered a moment ago: another set waits as if it had been offered itself.
  assert.equal(pick([seen('granja', daysAgo(0.01))], 'barrio').freshness, DEFAULT_WEIGHTS.floor)
  // Most of the way back after gameDays, sooner than a template seen itself.
  const days = DEFAULT_WEIGHTS.gameDays
  assert.ok(Math.abs(pick([seen('granja', daysAgo(days))], 'barrio').freshness - (1 - Math.exp(-1))) < 1e-9)
  assert.ok(pick([seen('granja', daysAgo(days))], 'barrio').freshness > pick([seen('barrio', daysAgo(days))], 'barrio').freshness)
  // A juego that isn't a game doesn't wait for one.
  assert.equal(pick([seen('granja', daysAgo(0.01))], 'juego').freshness, 1)
  // Nor does a game wait for a juego.
  assert.equal(pick([seen('juego', daysAgo(0.01))], 'barrio').freshness, 1)
})

test('thumbs up from the family make a template win more often, without making it certain', () => {
  const liked = candidate(template({ slug: 'liked' }))
  const other = candidate(template({ slug: 'other' }))
  const history = [1, 2, 3, 4, 5].map((days) => seen('liked', daysAgo(days + 30), 'up'))
  const rate = winRate([liked, other], { history }, 'liked')
  assert.ok(rate > 0.75, `won ${rate}`)
  assert.ok(rate < 0.99, `won ${rate}`)
  const [first] = rank([liked, other], context({ history }))
  const liking = /** @type {any} */ (rank([liked, other], context({ history })).find((each) => each.template.slug === 'liked')).pick
  assert.equal(liking.feedback.alpha, DEFAULT_WEIGHTS.prior + 5)
  assert.equal(liking.feedback.beta, DEFAULT_WEIGHTS.prior)
  assert.ok(first.pick.feedback.sample >= 0 && first.pick.feedback.sample <= 1)
})

test('other families reactions count at a fraction of the family own', () => {
  const liked = candidate(template({ slug: 'liked' }))
  const other = candidate(template({ slug: 'other' }))
  const others = new Map([['liked', { ups: 10, downs: 0 }]])
  const liking = /** @type {any} */ (rank([liked, other], context({ others })).find((each) => each.template.slug === 'liked')).pick
  assert.equal(liking.feedback.alpha, DEFAULT_WEIGHTS.prior + 10 * DEFAULT_WEIGHTS.others)
  assert.ok(winRate([liked, other], { others }, 'liked') > 0.7)
  const disliked = new Map([['liked', { ups: 0, downs: 10 }]])
  assert.ok(winRate([liked, other], { others: disliked }, 'liked') < 0.3)
})

test('the rating in the admin is where the feedback starts, so a juego rated higher wins more often for every family', () => {
  const rated = candidate(template({ slug: 'rated', rating: 5 }))
  const plain = candidate(template({ slug: 'plain' }))
  const ranked = rank([rated, plain], context())
  const pick = (/** @type {string} */ slug) => /** @type {any} */ (ranked.find((each) => each.template.slug === slug)).pick
  assert.equal(pick('rated').feedback.rating, 5)
  assert.ok(Math.abs(pick('rated').feedback.alpha - 0.7 * 2 * DEFAULT_WEIGHTS.prior) < 1e-9)
  assert.ok(Math.abs(pick('rated').feedback.beta - 0.3 * 2 * DEFAULT_WEIGHTS.prior) < 1e-9)
  assert.equal(pick('plain').feedback.alpha, DEFAULT_WEIGHTS.prior)
  assert.equal(pick('plain').feedback.beta, DEFAULT_WEIGHTS.prior)

  const rate = winRate([rated, plain], {}, 'rated')
  assert.ok(rate > 0.65, `won ${rate}`)
  assert.ok(rate < 0.95, `won ${rate}`)
  const low = candidate(template({ slug: 'low', rating: 1 }))
  assert.ok(winRate([low, plain], {}, 'low') < 0.35)
  // Other families' reactions move it from there.
  const others = new Map([['rated', { ups: 0, downs: 30 }]])
  assert.ok(winRate([rated, plain], { others }, 'rated') < 0.3)
})

test('a rating is two priors split by the share of ups it stands for', () => {
  assert.deepEqual(priorOf(3), { alpha: DEFAULT_WEIGHTS.prior, beta: DEFAULT_WEIGHTS.prior })
  for (const [rating, share] of [[1, 0.3], [2, 0.4], [4, 0.6], [5, 0.7]]) {
    const { alpha, beta } = priorOf(rating)
    assert.ok(Math.abs(alpha + beta - 2 * DEFAULT_WEIGHTS.prior) < 1e-9)
    assert.ok(Math.abs(alpha / (alpha + beta) - share) < 1e-9, `${rating} is ${share}`)
  }
})

test('the rating now is the admin rating moved by every family reactions, from 1 to 5', () => {
  const none = { ups: 0, downs: 0 }
  for (const rating of [1, 2, 3, 4, 5]) assert.equal(ratingNow(rating, none), rating)
  assert.ok(ratingNow(3, { ups: 4, downs: 0 }) > 4)
  assert.ok(ratingNow(5, { ups: 0, downs: 20 }) < 3)
  assert.equal(ratingNow(5, { ups: 1000, downs: 0 }), 5)
  assert.equal(ratingNow(1, { ups: 0, downs: 1000 }), 1)
  // It is the mean a family that never reacted draws around, to one decimal.
  const { alpha, beta } = priorOf(4)
  const ups = 6
  const downs = 2
  const mean = (alpha + DEFAULT_WEIGHTS.others * ups) / (alpha + beta + DEFAULT_WEIGHTS.others * (ups + downs))
  const now = 3 + (mean - 0.5) / DEFAULT_WEIGHTS.rating
  assert.ok(Math.abs(ratingNow(4, { ups, downs }) - now) <= 0.05, `${now}`)
  assert.equal(ratingNow(4, { ups, downs }), Math.round(10 * now) / 10)
})

test('a reaction to a similar template counts by the similarity, so a thumbs down spreads to games like it', () => {
  const downed = template({ slug: 'downed', categories: ['move'], themes: ['cuerpo'], energy: 'high' })
  const alike = candidate(template({ slug: 'alike', categories: ['move'], themes: ['cuerpo'], energy: 'high' }))
  const unlike = candidate(template({ slug: 'unlike', categories: ['create'], themes: ['dibujar'], energy: 'low' }))
  const history = [seen('downed', daysAgo(10), 'down')]
  const ranked = rank([alike, unlike], context({ history, catalog: [downed, alike.template, unlike.template] }))
  const pick = (/** @type {string} */ slug) => /** @type {any} */ (ranked.find((each) => each.template.slug === slug)).pick
  assert.ok(pick('alike').feedback.beta > pick('unlike').feedback.beta)
  assert.ok(pick('alike').feedback.beta > DEFAULT_WEIGHTS.prior)
  // A template the catalog no longer has spreads nothing.
  const gone = rank([alike, unlike], context({ history, catalog: [] }))
  assert.equal(/** @type {any} */ (gone.find((each) => each.template.slug === 'alike')).pick.feedback.beta, DEFAULT_WEIGHTS.prior)
})

test('a calm moment keeps the quiet juegos whole and takes most of the energetic ones away', () => {
  const quiet = candidate(template({ slug: 'quiet', energy: 'low' }))
  const middling = candidate(template({ slug: 'middling', energy: 'medium' }))
  const loud = candidate(template({ slug: 'loud', energy: 'high' }))
  const calm = rank([quiet, middling, loud], context({ mood: 'calm' }))
  const pick = (/** @type {ReturnType<typeof rank>} */ ranked, /** @type {string} */ slug) =>
    /** @type {any} */ (ranked.find((each) => each.template.slug === slug)).pick
  assert.equal(pick(calm, 'quiet').moment, 1)
  assert.equal(pick(calm, 'middling').moment, DEFAULT_WEIGHTS.moment.calm.medium)
  assert.equal(pick(calm, 'loud').moment, DEFAULT_WEIGHTS.moment.calm.high)
  assert.equal(pick(calm, 'quiet').mood, 'calm')
  assert.ok(winRate([quiet, loud], { mood: 'calm' }, 'quiet') > 0.95)

  // A lively moment is the other way round.
  const lively = rank([quiet, middling, loud], context({ mood: 'lively' }))
  assert.equal(pick(lively, 'loud').moment, 1)
  assert.equal(pick(lively, 'quiet').moment, DEFAULT_WEIGHTS.moment.lively.low)
  assert.ok(winRate([quiet, loud], { mood: 'lively' }, 'loud') > 0.95)

  // No mood at all leaves every template where it is.
  const anytime = rank([quiet, middling, loud], context())
  assert.ok(anytime.every((each) => each.pick.moment === 1))
  assert.equal(pick(anytime, 'quiet').mood, null)
})

test('an energetic juego is still offered before bed when it is the only one that fits', () => {
  const [only] = rank([candidate(template({ slug: 'loud', energy: 'high' }))], context({ mood: 'calm' }))
  assert.equal(only.template.slug, 'loud')
  assert.ok(only.pick.score > 0)
})

test('a fine afternoon brings the juegos outside up, and rain takes them away', () => {
  const inside = candidate(template({ slug: 'inside', place: 'indoor' }))
  const outside = candidate(template({ slug: 'outside', place: 'outdoor' }))
  const pick = (/** @type {ReturnType<typeof rank>} */ ranked, /** @type {string} */ slug) =>
    /** @type {any} */ (ranked.find((each) => each.template.slug === slug)).pick

  const fine = rank([inside, outside], context({ conditions: { weather: 'fine', reason: 'clear' } }))
  assert.equal(pick(fine, 'outside').weather, 1)
  assert.equal(pick(fine, 'inside').weather, DEFAULT_WEIGHTS.weather.fine.indoor)
  assert.deepEqual(pick(fine, 'outside').conditions, { weather: 'fine', reason: 'clear' })
  assert.ok(winRate([inside, outside], { conditions: { weather: 'fine', reason: 'clear' } }, 'outside') > 0.65)

  // Rain is the other way round, and harder: the plaza is out, the living room isn't.
  const poor = rank([inside, outside], context({ conditions: { weather: 'poor', reason: 'rain' } }))
  assert.equal(pick(poor, 'inside').weather, 1)
  assert.equal(pick(poor, 'outside').weather, DEFAULT_WEIGHTS.weather.poor.outdoor)
  assert.ok(winRate([inside, outside], { conditions: { weather: 'poor', reason: 'rain' } }, 'inside') > 0.95)

  // Weather that is neither, and no weather at all, leave every template where it is.
  const fair = rank([inside, outside], context({ conditions: { weather: 'fair', reason: 'grey' } }))
  assert.ok(fair.every((each) => each.pick.weather === 1))
  const unknown = rank([inside, outside], context())
  assert.ok(unknown.every((each) => each.pick.weather === 1))
  assert.equal(pick(unknown, 'inside').conditions, null)
})

test('at night the juego is at home, whatever the weather says', () => {
  const inside = candidate(template({ slug: 'inside', place: 'indoor' }))
  const outside = candidate(template({ slug: 'outside', place: 'outdoor' }))
  const pick = (/** @type {ReturnType<typeof rank>} */ ranked, /** @type {string} */ slug) =>
    /** @type {any} */ (ranked.find((each) => each.template.slug === slug)).pick

  // A clear night ranks like rain, and keeps what the forecast said.
  const clear = rank([inside, outside], context({ conditions: { weather: 'fine', reason: 'clear' }, night: true }))
  assert.equal(pick(clear, 'inside').weather, 1)
  assert.equal(pick(clear, 'outside').weather, DEFAULT_WEIGHTS.weather.poor.outdoor)
  assert.deepEqual(pick(clear, 'outside').conditions, { weather: 'fine', reason: 'clear' })
  assert.equal(pick(clear, 'outside').night, true)

  // So does a night with no weather: nobody goes to the plaza after dark.
  const unknown = rank([inside, outside], context({ night: true }))
  assert.equal(pick(unknown, 'outside').weather, DEFAULT_WEIGHTS.weather.poor.outdoor)
  assert.ok(winRate([inside, outside], { night: true }, 'inside') > 0.95)
})

test('a juego outside is still offered in the rain when it is the only one that fits', () => {
  const only = candidate(template({ slug: 'outside', place: 'outdoor' }))
  const [picked] = rank([only], context({ conditions: { weather: 'poor', reason: 'rain' } }))
  assert.equal(picked.template.slug, 'outside')
  assert.ok(picked.pick.score > 0)
})

test('the pick keeps every part of the score and the weights', () => {
  const [first] = rank([candidate(template({ slug: 'a' }))], context())
  assert.deepEqual(Object.keys(first.pick).sort(), [
    'conditions', 'difference', 'favorite', 'feedback', 'fit', 'freshness', 'moment', 'mood', 'named', 'night',
    'score', 'themes', 'weather', 'weights',
  ])
  assert.equal(
    first.pick.score,
    first.pick.fit *
      2 *
      first.pick.feedback.sample *
      first.pick.freshness *
      first.pick.difference *
      first.pick.moment *
      first.pick.weather,
  )
  assert.deepEqual(first.pick.weights, DEFAULT_WEIGHTS)
})

test('a beta draw stays in [0, 1] and averages alpha over alpha plus beta', () => {
  const random = seededRandom('beta')
  for (const [alpha, beta] of [[1, 1], [3, 3], [8, 2], [0.5, 0.5], [2, 9]]) {
    let sum = 0
    const rounds = 2000
    for (let round = 0; round < rounds; round++) {
      const draw = betaSample(alpha, beta, random)
      assert.ok(draw >= 0 && draw <= 1)
      sum += draw
    }
    assert.ok(Math.abs(sum / rounds - alpha / (alpha + beta)) < 0.03, `Beta(${alpha}, ${beta}) averaged ${sum / rounds}`)
  }
})

test('jaccard is the shared tags over all the tags', () => {
  assert.equal(jaccard(new Set(['a', 'b']), new Set(['b', 'c'])), 1 / 3)
  assert.equal(jaccard(new Set(['a']), new Set(['a'])), 1)
  assert.equal(jaccard(new Set(), new Set()), 0)
})
