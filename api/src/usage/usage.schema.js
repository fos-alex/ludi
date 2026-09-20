/**
 * What families do with Ludi (JUG-198): six things that happen, each one row,
 * so the admin's Uso page can count them without asking Google.
 *
 * Nothing here says who anyone is beyond the ids the rest of the database
 * already holds: no names, no email, no text a parent wrote. A deleted
 * account leaves its rows behind with null ids, so removing someone doesn't
 * rewrite what happened during the playtest.
 */
import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { users } from '../auth/auth.schema.js'
import { createdAt } from '../db/columns.js'
import { families } from '../families/families.schema.js'

/**
 * The six events, in the order the Uso page shows them. The same names go to
 * GA4, so they read the same in both places.
 */
export const USAGE_EVENTS = /** @type {const} */ ([
  'juego_shown',
  'juego_played',
  'story_told',
  'series_started',
  'account_created',
  'family_created',
])

export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    event: text({ enum: USAGE_EVENTS }).notNull(),
    // Null on an account created before its family, and on a family since deleted.
    familyId: uuid().references(() => families.id, { onDelete: 'set null' }),
    userId: text().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    // What the Uso page reads: a count per event over a stretch of days.
    index('usage_events_event_created_at_idx').on(table.event, table.createdAt),
    check('usage_events_event_check', sql`${table.event} in (${sql.raw(USAGE_EVENTS.map((event) => `'${event}'`).join(', '))})`),
  ],
)
