/**
 * The activities suggested to each family, from the catalog's templates.
 */
import { sql } from 'drizzle-orm'
import { check, index, jsonb, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core'
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
