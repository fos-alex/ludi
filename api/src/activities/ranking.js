/**
 * The ranking (JUG-104): which of the templates that fit a family is offered.
 * Fit is decided before this runs, in the service: age, slots, materials.
 * This orders what is left, and it is pure, so a seeded random gives the same
 * order every time and each rule has its own unit test.
 *
 * A template's score is six factors multiplied:
 *
 * - **Fit.** 1, plus a bonus when it is about something a kid playing loves
 *   (its themes against the kids' interests, read through catalog/themes.js),
 *   when it names an interest, and when the toy it drew is a favorite.
 * - **Feedback.** Thumbs up and down are binary outcomes, so each template
 *   is a Beta-Bernoulli arm and the pick is Thompson sampling (Chapelle and
 *   Li, 2011): one draw from Beta(alpha, beta), where alpha counts the ups
 *   and beta the downs. They start from the template's rating in the admin
 *   (JUG-192), 1 to 5, as ups and downs worth two `prior`s together: a 3 is
 *   `prior` of each, so a template nobody has judged draws around one half
 *   and the fit decides; a 5 starts at seven ups in ten, and a 1 at three.
 *   Among twenty juegos alike, a 5 comes first about five times as often as
 *   a 3, and a 1 about a tenth as often. One with ups draws higher and wins
 *   more often, and the more ups the more surely; one with downs draws low.
 *   The draw, not the mean, is what keeps a family from seeing the same
 *   best-rated game every time. The family's own reactions count in full,
 *   other families' at a fraction (the catalog-wide prior, as in empirical
 *   Bayes shrinkage), so what families like comes up more for everyone, and
 *   reactions to similar templates count by how similar they are, which is
 *   what makes a "No era para nosotros" spread to games like it. Similarity
 *   is Jaccard over the tags: categories, themes, skills, energy, and place.
 * - **Freshness.** A template the family saw comes back on an exponential
 *   curve: most of the way after `seenDays`, slower after one they said they
 *   played. It never reaches zero, so something can always be offered. The
 *   discovery games (JUG-128) also share one: once any of them is offered,
 *   all of them wait on the `gameDays` curve, so ¿Qué suena? comes up about
 *   as often however many sound sets there are, and most juegos stay
 *   screen-free.
 * - **Difference.** "Otro juego" is maximal marginal relevance (Carbonell
 *   and Goldstein, 1998) with one item: what is like the juego being left
 *   loses by its similarity to it.
 * - **Moment.** What the family is up for now (JUG-26), from the clock or
 *   from the parent's own tap: a calm moment keeps the low-energy templates
 *   whole and takes most of the high-energy ones away, so an energetic game
 *   doesn't come up just before bed, and a lively one does the reverse. No
 *   mood leaves every template where it is. It only ever lowers a score, and
 *   never to zero, so a family whose catalog is all high-energy games still
 *   gets one at night.
 * - **Weather.** What it is like outside where the family lives (JUG-25),
 *   read from the forecast by weather/conditions.js: a fine afternoon takes
 *   half of every indoor template away, so the few outdoor ones in the
 *   catalog come up; rain, heat, cold or wind takes most of the outdoor ones
 *   away instead. `fair` weather, and no weather at all — a family that
 *   hasn't said where they live, or a provider that is down — leave every
 *   template where it is. Night counts as poor weather whatever the forecast
 *   (JUG-191): after dark the juego is at home, which is what Home's moon
 *   tells the parent. Like the moment, it only ever lowers a score, and
 *   never to zero.
 *
 * Two things are out before scoring: the juego being left, and any template
 * whose last reaction from this family was a thumbs down. Each is let back
 * in only when nothing else is left.
 *
 * The score's parts are kept on the activity as its `pick`, with the
 * weights, so a suggestion can be read back and the weights moved later.
 */
import { placeholdersIn } from '../catalog/slots.js'

/** @typedef {import('../catalog/catalog.service.js').FillableActivityTemplate} Template */
/** @typedef {import('../catalog/slots.js').Fill} Fill */
/** @typedef {import('../clock.js').Mood} Mood */
/** @typedef {import('../weather/conditions.js').Conditions} Conditions */
/** @typedef {import('../weather/conditions.js').Weather} Weather */
/** @typedef {Template['energy']} Energy */
/** @typedef {Template['place']} Place */
/**
 * @typedef {object} Weights
 * @property {number} interest what a template about something a kid loves gains
 * @property {number} named what a template that names an interest gains
 * @property {number} favorite what a template that drew a favorite toy gains
 * @property {number} prior the ups and the downs a template rated 3 starts with, and half of
 *   what any rating is worth, which is how much one reaction moves it: at 3, the first up
 *   takes its mean from 0.5 to 0.57
 * @property {number} rating what each step of the admin's rating above or below 3 adds to or
 *   takes from the share of ups a template starts with
 * @property {number} others what one family's reaction counts for another, from 0 to 1
 * @property {number} alike what a reaction to another template counts, times their similarity
 * @property {number} seenDays days after which a template seen is most of the way back
 * @property {number} playedDays the same, for one the family said they played
 * @property {number} gameDays the same, for every discovery game once any of them was offered
 * @property {number} floor what a template seen a moment ago keeps
 * @property {number} different what a template loses for being like the one being left, times the similarity
 * @property {Record<Mood, Record<Energy, number>>} moment what a template of each energy keeps in each moment
 * @property {Record<Weather, Record<Place, number>>} weather what a template of each place keeps in each weather
 */
/**
 * @typedef {object} Seen one activity the family was offered
 * @property {string | null} templateId
 * @property {Date} createdAt
 * @property {'up' | 'down' | null} reaction
 */
/** @typedef {{ ups: number, downs: number }} Counts */
/**
 * @typedef {object} Pick the parts a template's score came from
 * @property {number} score
 * @property {number} fit
 * @property {string[]} themes the themes it shares with what the kids love
 * @property {boolean} named whether it names an interest
 * @property {boolean} favorite whether the toy it drew is a favorite
 * @property {{ rating: number, alpha: number, beta: number, sample: number }} feedback `rating` is the admin's
 * @property {number} freshness
 * @property {number} difference
 * @property {Mood | null} mood the moment it was picked for
 * @property {number} moment what that moment left it
 * @property {Conditions | null} conditions what it was like outside, and what said so
 * @property {boolean} night whether it was night, which keeps the juego at home
 * @property {number} weather what the weather and the night left it
 * @property {Weights} weights
 */
/** @typedef {{ template: Template, fill: Fill }} Candidate */

/** The weights until a family has its own. @type {Weights} */
export const DEFAULT_WEIGHTS = {
  interest: 1,
  named: 0.3,
  favorite: 0.3,
  prior: 3,
  rating: 0.1,
  // Two other families' reactions count as much as one of the family's own.
  others: 0.5,
  alike: 0.5,
  seenDays: 4,
  playedDays: 10,
  // Ten sound sets at this come up about as often as three did on their own.
  gameDays: 2,
  floor: 0.05,
  different: 0.8,
  moment: {
    calm: { low: 1, medium: 0.5, high: 0.15 },
    lively: { low: 0.25, medium: 0.6, high: 1 },
  },
  // Indoor templates outnumber outdoor ones five to one, so a fine afternoon
  // has to take a good half of them away for the plaza to come up at all.
  weather: {
    fine: { outdoor: 1, indoor: 0.5 },
    fair: { outdoor: 1, indoor: 1 },
    poor: { outdoor: 0.15, indoor: 1 },
  },
}

const DAY = 86_400_000

/**
 * The candidates, best first, each with why it scored what it did.
 * @param {Candidate[]} candidates the templates that fit, each with its fill
 * @param {{
 *   interestThemes: string[],
 *   favoriteToys: string[],
 *   history: Seen[],
 *   others: Map<string, Counts>,
 *   catalog: Template[],
 *   after?: Template | null,
 *   mood?: Mood | null,
 *   conditions?: Conditions | null,
 *   night?: boolean,
 *   now: Date,
 *   random: () => number,
 *   weights?: Weights,
 * }} context `interestThemes` are the themes of what the kids playing love;
 *   `favoriteToys` the names of the favorites; `history` what this family was
 *   offered, newest first; `others` the reactions of every other family, by
 *   template; `catalog` every template a reaction could be about, fitting or
 *   not; `after` the template of the juego being left; `mood` the moment the
 *   juego is for, or null for no preference; `conditions` what it is like
 *   outside where they live, or null when there is nothing to say; `night`
 *   whether it is night, when outside is out whatever the weather.
 * @returns {{ template: Template, fill: Fill, pick: Pick }[]}
 */
export function rank(
  candidates,
  {
    interestThemes,
    favoriteToys,
    history,
    others,
    catalog,
    after = null,
    mood = null,
    conditions = null,
    night = false,
    now,
    random,
    weights = DEFAULT_WEIGHTS,
  },
) {
  const seen = summarize(history)
  const byId = new Map(catalog.map((template) => [template.id, template]))
  // What the family reacted to, with the template when the catalog still has it.
  const reacted = [...seen.entries()]
    .filter(([, entry]) => entry.ups + entry.downs > 0)
    .map(([id, entry]) => ({ id, ...entry, template: byId.get(id) ?? null }))
  // When a discovery game was last offered, whichever it was.
  const lastGame = [...seen.entries()]
    .filter(([id]) => byId.get(id)?.game)
    .reduce((/** @type {Date | null} */ last, [, entry]) => (last && last > entry.lastSeen ? last : entry.lastSeen), null)

  const pool = firstNonEmpty([
    candidates.filter(({ template }) => template.id !== after?.id && seen.get(template.id)?.last !== 'down'),
    candidates.filter(({ template }) => template.id !== after?.id),
    candidates,
  ])

  const interests = new Set(interestThemes)
  const favorites = new Set(favoriteToys)
  const tagsOf = memo(tags)

  const ranked = pool.map(({ template, fill }) => {
    const themes = template.themes.filter((theme) => interests.has(theme))
    const named = placeholdersIn(template.texts).has('interest')
    const favorite = fill.toy != null && favorites.has(fill.toy)
    const fit = 1 + (themes.length > 0 ? weights.interest : 0) + (named ? weights.named : 0) + (favorite ? weights.favorite : 0)

    const own = seen.get(template.id)
    const other = others.get(template.id)
    const start = priorOf(template.rating, weights)
    let alpha = start.alpha + (own?.ups ?? 0) + weights.others * (other?.ups ?? 0)
    let beta = start.beta + (own?.downs ?? 0) + weights.others * (other?.downs ?? 0)
    for (const entry of reacted) {
      if (entry.id === template.id) continue
      const like = entry.template ? jaccard(tagsOf(template), tagsOf(entry.template)) : 0
      alpha += weights.alike * like * entry.ups
      beta += weights.alike * like * entry.downs
    }
    const sample = betaSample(alpha, beta, random)
    const feedback = 2 * sample

    let freshness = own ? freshnessOf(own, now, weights) : 1
    if (template.game && lastGame) {
      freshness = Math.min(freshness, Math.max(weights.floor, backBy(lastGame, weights.gameDays, now)))
    }
    const difference = after ? 1 - weights.different * jaccard(tagsOf(template), tagsOf(after)) : 1
    const moment = mood ? weights.moment[mood][template.energy] : 1
    const outside = night ? 'poor' : conditions?.weather
    const weather = outside ? weights.weather[outside][template.place] : 1

    const score = fit * feedback * freshness * difference * moment * weather
    return {
      template,
      fill,
      pick: {
        score, fit, themes, named, favorite, feedback: { rating: template.rating, alpha, beta, sample },
        freshness, difference, mood, moment, conditions, night, weather, weights,
      },
    }
  })

  return ranked.sort((a, b) => b.pick.score - a.pick.score || a.template.slug.localeCompare(b.template.slug))
}

/**
 * The ups and downs a template's feedback starts with, from its rating in
 * the admin (JUG-192): two `prior`s split by the share of ups the rating
 * stands for, one half at 3 and `rating` more or less for each step.
 * @param {number} rating 1 to 5
 * @param {Weights} [weights]
 * @returns {{ alpha: number, beta: number }}
 */
export function priorOf(rating, weights = DEFAULT_WEIGHTS) {
  const share = 0.5 + (rating - 3) * weights.rating
  return { alpha: 2 * weights.prior * share, beta: 2 * weights.prior * (1 - share) }
}

/**
 * A template's rating now, from 1 to 5, for the admin (JUG-192): its rating
 * there, moved by every family's reactions, each counting as another
 * family's does in the ranking. It is where a family that never reacted to
 * the template, or to one like it, starts, on the admin's scale: a share of
 * ups above what a 5 starts with is still a 5. To one decimal, which is all
 * the admin shows.
 * @param {number} rating the admin's, 1 to 5
 * @param {Counts} counts every family's reactions to it
 * @param {Weights} [weights]
 */
export function ratingNow(rating, { ups, downs }, weights = DEFAULT_WEIGHTS) {
  const start = priorOf(rating, weights)
  const alpha = start.alpha + weights.others * ups
  const share = alpha / (alpha + start.beta + weights.others * downs)
  return Math.round(10 * Math.min(5, Math.max(1, 3 + (share - 0.5) / weights.rating))) / 10
}

/**
 * What the family's history says about each template: when it was last
 * offered, when they last said they played it, its ups and downs, and the
 * last reaction.
 * @param {Seen[]} history newest first
 * @returns {Map<string, { lastSeen: Date, lastPlayed: Date | null, ups: number, downs: number, last: 'up' | 'down' | null }>}
 */
function summarize(history) {
  /** @type {ReturnType<typeof summarize>} */
  const seen = new Map()
  for (const row of history) {
    if (!row.templateId) continue
    const entry = seen.get(row.templateId) ?? {
      lastSeen: row.createdAt,
      lastPlayed: null,
      ups: 0,
      downs: 0,
      last: null,
    }
    if (row.createdAt > entry.lastSeen) entry.lastSeen = row.createdAt
    if (row.reaction === 'up') {
      entry.ups += 1
      if (!entry.lastPlayed || row.createdAt > entry.lastPlayed) entry.lastPlayed = row.createdAt
    }
    if (row.reaction === 'down') entry.downs += 1
    // Newest first, so the first reaction met is the last one given.
    if (row.reaction && !entry.last) entry.last = row.reaction
    seen.set(row.templateId, entry)
  }
  return seen
}

/**
 * How far back a template seen is, from `floor` a moment after to 1 as the
 * days pass: 1 − e^(−days/seenDays), and the slower curve too when the
 * family played it.
 * @param {{ lastSeen: Date, lastPlayed: Date | null }} entry
 * @param {Date} now
 * @param {Weights} weights
 */
function freshnessOf(entry, now, weights) {
  let freshness = backBy(entry.lastSeen, weights.seenDays, now)
  if (entry.lastPlayed) freshness = Math.min(freshness, backBy(entry.lastPlayed, weights.playedDays, now))
  return Math.max(weights.floor, freshness)
}

/**
 * How far back something offered at `since` is by `now`, from 0 to 1, on the
 * curve that is most of the way after `days`: 1 − e^(−elapsed/days).
 * @param {Date} since
 * @param {number} days
 * @param {Date} now
 */
function backBy(since, days, now) {
  return 1 - Math.exp(-Math.max(0, now.getTime() - since.getTime()) / DAY / days)
}

/** A template's tags, each prefixed so a skill never equals a theme. @param {Template} template */
function tags(template) {
  return new Set([
    ...template.categories.map((category) => `category:${category}`),
    ...template.themes.map((theme) => `theme:${theme}`),
    ...template.skills.map((skill) => `skill:${skill}`),
    `energy:${template.energy}`,
    `place:${template.place}`,
  ])
}

/** How alike two tag sets are, from 0 to 1. @param {Set<string>} a @param {Set<string>} b */
export function jaccard(a, b) {
  let shared = 0
  for (const tag of a) if (b.has(tag)) shared += 1
  const union = a.size + b.size - shared
  return union === 0 ? 0 : shared / union
}

/**
 * One draw from Beta(alpha, beta), as a ratio of two gamma draws, with
 * `random` as the only source of chance.
 * @param {number} alpha
 * @param {number} beta
 * @param {() => number} random
 */
export function betaSample(alpha, beta, random) {
  const x = gammaSample(alpha, random)
  const y = gammaSample(beta, random)
  return x + y === 0 ? 0.5 : x / (x + y)
}

/**
 * One draw from Gamma(shape, 1), by Marsaglia and Tsang's method, which
 * takes a shape of one or more; a smaller one is boosted from shape + 1.
 * @param {number} shape
 * @param {() => number} random
 */
function gammaSample(shape, random) {
  if (shape < 1) return gammaSample(shape + 1, random) * Math.pow(nonZero(random()), 1 / shape)
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    const z = normalSample(random)
    const v = Math.pow(1 + c * z, 3)
    if (v <= 0) continue
    const u = nonZero(random())
    if (Math.log(u) < 0.5 * z * z + d - d * v + d * Math.log(v)) return d * v
  }
}

/** One standard normal draw, by Box–Muller. @param {() => number} random */
function normalSample(random) {
  return Math.sqrt(-2 * Math.log(nonZero(random()))) * Math.cos(2 * Math.PI * random())
}

/** A uniform that can be passed to log. @param {number} value */
const nonZero = (value) => (value <= 0 ? Number.MIN_VALUE : value)

/** @template T @param {T[][]} lists */
function firstNonEmpty(lists) {
  return lists.find((list) => list.length > 0) ?? []
}

/**
 * @template {object} K
 * @template V
 * @param {(key: K) => V} compute
 */
function memo(compute) {
  const cache = new WeakMap()
  return (/** @type {K} */ key) => {
    let value = cache.get(key)
    if (value === undefined) {
      value = compute(key)
      cache.set(key, value)
    }
    return /** @type {V} */ (value)
  }
}
