/**
 * The whole database schema. Each domain defines its tables beside its
 * service, in `<domain>.schema.js`; this gathers them for the Drizzle client
 * and for drizzle-kit, which generates the SQL migrations in api/migrations
 * from them. A new schema file goes here too.
 */
export * from '../activities/activities.schema.js'
export * from '../audit/audit.schema.js'
export * from '../auth/auth.schema.js'
export * from '../catalog/catalog.schema.js'
export * from '../families/families.schema.js'
export * from '../invitations/invitations.schema.js'
export * from '../materials/materials.schema.js'
export * from '../stories/stories.schema.js'
export * from '../toys/toys.schema.js'
export * from '../usage/usage.schema.js'
