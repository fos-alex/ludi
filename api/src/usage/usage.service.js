/**
 * What families do with Ludi (JUG-198). Each of the six events is recorded
 * where it happens, in one row here and, when GA4 is configured, in one call
 * to Google.
 *
 * Nothing a parent does may fail because of this. A failed insert is logged
 * and let go, the way the story audit does it; without a logger it throws,
 * which is what a test wants. The call to Google is never awaited at all.
 */
import { count, countDistinct, eq, gte, sql } from 'drizzle-orm'
import { USAGE_EVENTS, usageEvents } from './usage.schema.js'

/** @typedef {import('../db/client.js').Db} Db */
/** @typedef {import('./ga.js').Ga} Ga */
/** @typedef {typeof USAGE_EVENTS[number]} UsageEvent */
/** @typedef {Record<UsageEvent, number>} EventCounts */
/** @typedef {{ day: string } & EventCounts} DayCounts */
/** @typedef {ReturnType<typeof createUsageService>} UsageService */

/**
 * Where the families are. Days are counted here, not in UTC: a story read at
 * nine at night belongs to that evening, and UTC would file it on the next
 * day, which is exactly when stories happen.
 */
const ZONE = 'America/Argentina/Buenos_Aires'

const DAY_MS = 24 * 60 * 60 * 1000

/** How far back the Uso page looks. */
export const USAGE_DAYS = 90

/** The stretch the page's "last week" numbers cover. */
export const RECENT_DAYS = 7

/**
 * @param {{
 *   db: Db,
 *   ga?: Ga | null,
 *   logger?: { error: (details: object, message: string) => void } | null,
 *   now?: () => Date,
 * }} deps `ga` absent means the events are only kept here, which is how the
 *   tests and a server without ANALYTICS_MEASUREMENT_ID run.
 */
export function createUsageService({ db, ga = null, logger = null, now = () => new Date() }) {
  return {
    /**
     * Records one thing a family did.
     * @param {UsageEvent} event
     * @param {{ familyId?: string | null, userId?: string | null }} [who]
     */
    async record(event, { familyId = null, userId = null } = {}) {
      try {
        await db.insert(usageEvents).values({ event, familyId, userId })
      } catch (error) {
        if (!logger) throw error
        logger.error({ err: error, event }, 'the usage log did not record an event')
      }
      // Not awaited: Google is on the other side of the internet, and the
      // parent is waiting. `send` swallows its own failures.
      void ga?.send(event, { familyId, userId })
    },

    /**
     * Everything the Uso page draws: the total per event since the beginning,
     * the same for the last week, a row per day for the last three months
     * with no gaps, and how many families have played at least one juego.
     * @returns {Promise<{ totals: EventCounts, recent: EventCounts, days: DayCounts[], familiesPlayed: number }>}
     */
    async counts() {
      const at = now()
      // A day of slack, so a row at the edge of the window is never missed;
      // anything outside the span below is dropped when the days are filled in.
      const since = new Date(at.getTime() - (USAGE_DAYS + 1) * DAY_MS)
      // The zone is written into the SQL rather than bound, so the expression
      // in the select and the one grouped by are the same one to Postgres.
      const day = sql`to_char(${usageEvents.createdAt} at time zone ${sql.raw(`'${ZONE}'`)}, 'YYYY-MM-DD')`

      const [totals, daily, [played]] = await Promise.all([
        db.select({ event: usageEvents.event, total: count() }).from(usageEvents).groupBy(usageEvents.event),
        db
          .select({ event: usageEvents.event, day: day.mapWith(String), total: count() })
          .from(usageEvents)
          .where(gte(usageEvents.createdAt, since))
          // By position: the day is an expression, and naming it twice makes
          // Postgres read the two as different ones.
          .groupBy(sql`1, 2`),
        db
          .select({ families: countDistinct(usageEvents.familyId) })
          .from(usageEvents)
          .where(eq(usageEvents.event, 'juego_played')),
      ])

      const span = daySpan(USAGE_DAYS, at)
      const byDay = new Map(span.map((each) => [each, { day: each, ...noCounts() }]))
      for (const row of daily) {
        const bucket = byDay.get(row.day)
        if (bucket) bucket[row.event] = row.total
      }

      const days = span.map((each) => /** @type {DayCounts} */ (byDay.get(each)))
      const recent = noCounts()
      for (const each of days.slice(-RECENT_DAYS)) {
        for (const event of USAGE_EVENTS) recent[event] += each[event]
      }

      const all = noCounts()
      for (const row of totals) all[row.event] = row.total

      return { totals: all, recent, days, familiesPlayed: played?.families ?? 0 }
    },
  }
}

/** Every event at zero, which is what a day nobody played looks like. @returns {EventCounts} */
function noCounts() {
  return Object.fromEntries(USAGE_EVENTS.map((event) => [event, 0]))
}

/** The last `days` days where the families are, oldest first. @param {number} days @param {Date} at */
function daySpan(days, at) {
  // Midday, so stepping back a day never lands on a different one.
  const anchor = Date.parse(`${dayIn(at)}T12:00:00Z`)
  return Array.from({ length: days }, (_, index) => dayIn(new Date(anchor - (days - 1 - index) * DAY_MS)))
}

/** The day a moment falls on where the families are, as `YYYY-MM-DD`. @param {Date} at */
function dayIn(at) {
  return at.toLocaleDateString('en-CA', { timeZone: ZONE })
}
