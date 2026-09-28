/**
 * The activities suggested to each family, from the catalog's templates.
 */
import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, real, smallint, text, uuid } from 'drizzle-orm/pg-core'
import { activityTemplates } from '../catalog/catalog.schema.js'
import { createdAt, timestamptz } from '../db/columns.js'
import { families } from '../families/families.schema.js'

// Activities suggested to a family, as they were tailored: the text stays what
// the parent saw, even if the template or the family changes later.
export const activities = pgTable(
  'activities',
  {
    id: uuid().primaryKey().defaultRandom(),
    familyId: uuid()
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    templateId: uuid().references(() => activityTemplates.id, { onDelete: 'set null' }),
    title: text().notNull(),
    minutes: smallint().notNull(),
    place: text({ enum: ['indoor', 'outdoor'] }).notNull(),
    why: text().notNull(),
    needs: text().notNull(),
    steps: text().array().notNull(),
    easier: text().notNull(),
    harder: text().notNull(),
    // The discovery game dealt with it (JUG-177): for ¿Qué suena?, the five
    // rounds as the parent will play them. Null for every other juego.
    game: jsonb(),
    // The materials the template needed, by key from src/materials/materials.js
    // (JUG-196): what the family gathered for this juego, and what the next
    // one is picked to reuse. Empty for a juego that needs nothing.
    materials: text().array().notNull().default(sql`'{}'`),
    // The kids who played (JUG-107), for the recommendations and the journal.
    // No foreign key: the record outlives a kid removed from the profile.
    kidIds: uuid().array().notNull().default(sql`'{}'`),
    // The feedback tap (JUG-23): one reaction per juego, which the parent can
    // change or take back. Nothing about how long they played.
    reaction: text({ enum: ['up', 'down'] }),
    reactedAt: timestamptz(),
    // When the parent last tapped Empezar on it (JUG-188), for the family's
    // history: a juego played again moves up. Only when it started, never
    // how long they played. Null while it was only suggested.
    playedAt: timestamptz(),
    // Why the ranking picked this template (JUG-104): the parts of its score
    // and the weights, so a suggestion can be read back, and what the parent
    // chose it to be (JUG-31). Null for a juego from before the ranking.
    pick: jsonb(),
    createdAt: createdAt(),
  },
  (table) => [
    index('activities_family_id_created_at_idx').on(table.familyId, table.createdAt.desc()),
    // The reactions of every family, by template, which every suggestion reads.
    index('activities_template_id_reaction_idx').on(table.templateId).where(sql`${table.reaction} is not null`),
    check('activities_reaction_check', sql`${table.reaction} in ('up', 'down')`),
  ],
)

// Every call to Jev (JUG-200), one per suggestion that asked it, kept to see
// how Jev rates the juegos: what it was asked for, which model answered, and
// how long it took. A failed call is kept too, with what went wrong and no
// ratings. Nothing the family wrote goes in: the kids are the activity's
// `kid_ids`, and what the parent thought of the juego is its `reaction`.
export const jevCalls = pgTable(
  'jev_calls',
  {
    id: uuid().primaryKey().defaultRandom(),
    familyId: uuid()
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    // The suggestion Jev was asked for, which says which juego won.
    activityId: uuid()
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    // The versioned id that answered, such as jev-1.13.0, or null when none did.
    model: text(),
    inputTokens: integer(),
    durationMs: integer().notNull(),
    // Why there are no ratings: the kind of failure, never what was sent.
    error: text(),
    createdAt: createdAt(),
  },
  (table) => [index('jev_calls_created_at_idx').on(table.createdAt)],
)

// What Jev answered for each juego in a call: the probability that the kids
// playing would enjoy it.
export const jevRatings = pgTable(
  'jev_ratings',
  {
    id: uuid().primaryKey().defaultRandom(),
    callId: uuid()
      .notNull()
      .references(() => jevCalls.id, { onDelete: 'cascade' }),
    templateId: uuid().references(() => activityTemplates.id, { onDelete: 'set null' }),
    noul: real().notNull(),
  },
  (table) => [index('jev_ratings_call_id_idx').on(table.callId), index('jev_ratings_template_id_idx').on(table.templateId)],
)
