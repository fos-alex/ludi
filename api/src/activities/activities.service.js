/**
 * The activities suggested to each family. A suggestion is a catalog template
 * that fits the family, ranked above the others that fit (ranking.js), with
 * its slots filled from their profile, saved as the parent saw it. The
 * parent's reaction to it (JUG-23) is saved on the same row, and every later
 * ranking reads it. So is when they last started it (JUG-188), which is what
 * puts it in the family's history.
 */
import { and, count, desc, eq, isNotNull, ne, sql } from 'drizzle-orm'
import { fillFor, render } from '../catalog/slots.js'
import { themesOf } from '../catalog/themes.js'
import { moodAt, nightAt } from '../clock.js'
import { activities } from './activities.schema.js'
import { ANY, matching } from './choices.js'
import { rank, ratingNow } from './ranking.js'
import { NotFoundError } from '../errors.js'
import { kidIdsOf } from '../families/families.service.js'

/** @typedef {'up' | 'down'} Reaction */
/** @typedef {import('../clock.js').Mood} Mood */
/**
 * @typedef {{
 *   id: string, title: string, minutes: number, place: 'indoor' | 'outdoor',
 *   why: string, needs: string, steps: string[], easier: string, harder: string,
 *   game: Game | null, reaction: Reaction | null,
 * }} Activity
 * `game` is the discovery game dealt with it (JUG-177), which Empezar opens instead of the timer.
 */
/**
 * @typedef {{
 *   id: string, title: string, minutes: number, place: 'indoor' | 'outdoor',
 *   reaction: Reaction | null, playedAt: Date,
 * }} PlayedActivity
 * A juego in the family's history (JUG-188), as its card shows it.
 */
/** @typedef {import('../games/rounds.js').Game} Game */
/** @typedef {import('./choices.js').Choices} Choices */
/**
 * @typedef {Activity & { closest: boolean }} Suggestion
 * A new juego, and whether it is only the closest to what the parent chose
 * (JUG-31), because no juego matched all of it.
 */
/**
 * @typedef {{ ups: number, downs: number, rating: number }} Reactions
 * What every family said about a template, and its rating now, 1 to 5 (JUG-192).
 */
/** @typedef {import('../catalog/catalog.service.js').ActivityTemplate} ActivityTemplate */
/** @typedef {import('../catalog/catalog.service.js').CatalogService} CatalogService */
/** @typedef {import('drizzle-orm').SQL} SQL */
/** @typedef {import('../db/client.js').Db} Db */
/** @typedef {import('../families/families.service.js').FamiliesService} FamiliesService */
/** @typedef {import('../games/games.service.js').GamesService} GamesService */
/** @typedef {import('../materials/materials.service.js').MaterialsService} MaterialsService */
/** @typedef {import('../weather/weather.service.js').WeatherService} WeatherService */
/**
 * @typedef {import('../weather/conditions.js').Conditions & { night: boolean }} Outside
 * What the juegos are picked for outside (JUG-191): the weather where the
 * family lives, and whether it is night.
 */
/** @typedef {ReturnType<typeof createActivitiesService>} ActivitiesService */

/** How many of the family's latest activities the ranking reads. */
const HISTORY = 400

/** The columns an activity is sent with, as the parent saw it. */
const activityColumns = {
  id: activities.id,
  title: activities.title,
  minutes: activities.minutes,
  place: activities.place,
  why: activities.why,
  needs: activities.needs,
  steps: activities.steps,
  easier: activities.easier,
  harder: activities.harder,
  game: activities.game,
  reaction: activities.reaction,
}

// When a juego was last played (JUG-188): its Empezar, or its ¡Lo hicimos!,
// whichever came later. A thumbs up says they played it too, which is how
// juegos from before Empezar was recorded, and ones started offline, count.
// `greatest` skips a null, so a juego with neither was never played.
const lastPlayed = sql`greatest(${activities.playedAt}, case when ${activities.reaction} = 'up' then ${activities.reactedAt} end)`

/**
 * @param {{
 *   db: Db,
 *   catalog: CatalogService,
 *   families: FamiliesService,
 *   games: GamesService,
 *   materials: MaterialsService,
 *   weather: WeatherService,
 *   random?: () => number,
 *   now?: () => Date,
 *   usage?: import('../usage/usage.service.js').UsageService | null,
 * }} deps `random` is the only source of chance, `now` the clock the
 *   freshness is measured against; tests pin both. `weather` answers null for
 *   a family that hasn't said where they live, and whenever it can't be read.
 *   `usage` counts the juegos shown and played (JUG-198); absent, nothing is counted.
 */
export function createActivitiesService({
  db,
  catalog,
  families,
  games,
  materials,
  weather,
  random = Math.random,
  now = () => new Date(),
  usage = null,
}) {
  return {
    /**
     * Picks a template that is switched on, whose age range covers every kid
     * playing, whose slots the family can fill, and that needs no material the
     * family doesn't have (JUG-153); keeps the ones that match what the parent
     * chose, or come closest to it (JUG-31); ranks them by fit, feedback,
     * freshness, difference from the juego being left, the moment, and what
     * it is like outside (ranking.js); fills the winner's slots, and deals
     * its game when it is a discovery game (JUG-177); and saves the result
     * with the kids who played and why it won.
     * @param {string} familyId
     * @param {{ after?: string | null, userId?: string | null, mood?: Mood | null, choices?: Choices }} [options] the
     *   activity to move on from; the adult asking, whose kids sitting out are left out (everyone
     *   plays without one); the moment the juego is for (JUG-26); and what the parent chose it to
     *   be (JUG-31). A caller that leaves `mood` out gets the clock's, calm in the evening, so a
     *   juego is calm before bed even when the client says nothing; `null` asks for no preference.
     * @returns {Promise<Suggestion>}
     */
    async suggest(familyId, { after = null, userId = null, mood, choices = ANY } = {}) {
      const at = now()
      const isAfter = sql`${activities.id} = ${after}`
      const [profile, templates, missing, history, others, place] = await Promise.all([
        families.playingProfile(familyId, userId),
        catalog.activeActivityTemplates(),
        materials.missing(familyId),
        // The latest ones, with the one being moved on from always among them.
        db
          .select({
            id: activities.id,
            templateId: activities.templateId,
            createdAt: activities.createdAt,
            reaction: activities.reaction,
            isAfter: isAfter.mapWith(Boolean),
          })
          .from(activities)
          .where(eq(activities.familyId, familyId))
          .orderBy(sql`${isAfter} desc nulls last`, desc(activities.createdAt))
          .limit(HISTORY),
        // Every other family's reactions, by template.
        reactionCounts(db, ne(activities.familyId, familyId)),
        // Where the family lives, for the weather (JUG-25). Null until they say.
        families.placeOf(familyId),
      ])
      // Cached per location on the server, and never a reason to fail a juego.
      const conditions = await weather.conditionsAt(place)

      const fitting = templates.flatMap((template) => {
        if (template.materials.some((key) => missing.has(key))) return []
        const fill = fillFor(profile, template, random, { everyKid: true })
        return fill ? [{ template, fill }] : []
      })
      if (fitting.length === 0) {
        throw new NotFoundError('No activity in the catalog fits this family yet', 'NO_FITTING_ACTIVITY')
      }

      const { chosen, closest } = matching(fitting, choices)
      const afterTemplateId = history.find((row) => row.isAfter)?.templateId ?? null
      const [{ template, fill, pick }] = rank(chosen, {
        interestThemes: themesOf(profile.interests),
        favoriteToys: profile.toys.filter((toy) => toy.favorite).map((toy) => toy.name),
        history: history.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        others,
        catalog: templates,
        after: templates.find((each) => each.id === afterTemplateId) ?? null,
        mood: mood === undefined ? moodAt(at) : mood,
        conditions,
        night: nightAt(at),
        now: at,
        random,
      })

      const activity = {
        title: render(template.title, fill),
        minutes: template.minutes,
        place: template.place,
        why: render(template.why, fill),
        needs: render(template.needs, fill, { keepStart: true }),
        steps: template.steps.map((step) => render(step, fill)),
        easier: render(template.easier, fill),
        harder: render(template.harder, fill),
        game: template.game ? await games.deal(familyId, template.game, profile) : null,
      }
      const [{ id }] = await db
        .insert(activities)
        .values({
          familyId,
          templateId: template.id,
          kidIds: kidIdsOf(profile),
          pick: { ...pick, choices, closest },
          ...activity,
        })
        .returning({ id: activities.id })
      await usage?.record('juego_shown', { familyId, userId })
      return { id, ...activity, reaction: null, closest }
    },

    /**
     * The weather a juego is picked for now, for Home to show (JUG-191), read
     * the way `suggest` reads it, so what Home says is what the ranking does.
     * Null when there is no weather to show: the family hasn't said where
     * they live, or the forecast couldn't be read.
     * @param {string} familyId
     * @returns {Promise<Outside | null>}
     */
    async outside(familyId) {
      const conditions = await weather.conditionsAt(await families.placeOf(familyId))
      return conditions && { ...conditions, night: nightAt(now()) }
    },

    /**
     * Saves how a juego went, or takes the reaction back with null. One
     * reaction per juego, and the parent can change it (JUG-23).
     * @param {string} familyId
     * @param {string} id
     * @param {Reaction | null} reaction
     * @returns {Promise<{ id: string, reaction: Reaction | null }>}
     */
    async react(familyId, id, reaction) {
      const [row] = await db
        .update(activities)
        .set({ reaction, reactedAt: reaction ? now() : null })
        .where(and(eq(activities.id, id), eq(activities.familyId, familyId)))
        .returning({ id: activities.id, reaction: activities.reaction })
      if (!row) throw new NotFoundError('No such activity')
      return row
    },

    /**
     * One of the family's juegos, as the parent saw it, to play it again
     * from the history (JUG-188).
     * @param {string} familyId
     * @param {string} id
     * @returns {Promise<Activity>}
     */
    async find(familyId, id) {
      const [row] = await db
        .select(activityColumns)
        .from(activities)
        .where(and(eq(activities.id, id), eq(activities.familyId, familyId)))
      if (!row) throw new NotFoundError('No such activity')
      return { ...row, game: /** @type {Game | null} */ (row.game) }
    },

    /**
     * The parent tapped Empezar on a juego, its timer's or its game's
     * (JUG-188). Playing it again moves the time up; nothing about how long
     * they played is kept.
     * @param {string} familyId
     * @param {string} id
     * @param {{ userId?: string | null }} [options] the adult who tapped it, for the count (JUG-198)
     */
    async play(familyId, id, { userId = null } = {}) {
      const [row] = await db
        .update(activities)
        .set({ playedAt: now() })
        .where(and(eq(activities.id, id), eq(activities.familyId, familyId)))
        .returning({ id: activities.id })
      if (!row) throw new NotFoundError('No such activity')
      // Every tap counts, so a juego played again is two.
      await usage?.record('juego_played', { familyId, userId })
    },

    /**
     * The juegos the family played since a moment, the one played last first
     * (JUG-188). Each is there once, at the last time it was played.
     * @param {string} familyId
     * @param {{ since: Date, limit: number }} options
     * @returns {Promise<PlayedActivity[]>}
     */
    async playedSince(familyId, { since, limit }) {
      return db
        .select({
          id: activities.id,
          title: activities.title,
          minutes: activities.minutes,
          place: activities.place,
          reaction: activities.reaction,
          playedAt: lastPlayed.mapWith(activities.playedAt),
        })
        .from(activities)
        .where(and(eq(activities.familyId, familyId), sql`${lastPlayed} >= ${since}`))
        .orderBy(sql`${lastPlayed} desc`, desc(activities.id))
        .limit(limit)
    },

    /**
     * Each template's rating now, for the admin (JUG-192): its rating there,
     * moved by every family's thumbs up and down, with the counts.
     * @param {Pick<ActivityTemplate, 'id' | 'rating'>[]} templates
     * @returns {Promise<Map<string, Reactions>>}
     */
    async ratings(templates) {
      const counts = await reactionCounts(db)
      return new Map(
        templates.map(({ id, rating }) => {
          const { ups, downs } = counts.get(id) ?? { ups: 0, downs: 0 }
          return [id, { ups, downs, rating: ratingNow(rating, { ups, downs }) }]
        }),
      )
    },
  }
}

/**
 * The thumbs up and down each template got, from the families `where` keeps,
 * or from every family.
 * @param {Db} db
 * @param {SQL} [where]
 * @returns {Promise<Map<string, { ups: number, downs: number }>>}
 */
async function reactionCounts(db, where) {
  const rows = await db
    .select({ templateId: activities.templateId, reaction: activities.reaction, count: count() })
    .from(activities)
    .where(and(isNotNull(activities.reaction), isNotNull(activities.templateId), where))
    .groupBy(activities.templateId, activities.reaction)
  /** @type {Map<string, { ups: number, downs: number }>} */
  const counts = new Map()
  for (const row of rows) {
    const id = /** @type {string} */ (row.templateId)
    const entry = counts.get(id) ?? { ups: 0, downs: 0 }
    if (row.reaction === 'up') entry.ups += row.count
    else entry.downs += row.count
    counts.set(id, entry)
  }
  return counts
}
