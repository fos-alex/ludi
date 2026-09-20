import { errorBody } from '../http/schemas.js'
import { USAGE_EVENTS } from './usage.schema.js'

/** @typedef {import('./usage.controller.js').UsageController} UsageController */

const whole = { type: 'integer', minimum: 0 }

/** One count per event, all six always there, zero for an event nobody has set off yet. */
const eventCounts = {
  type: 'object',
  required: [...USAGE_EVENTS],
  properties: Object.fromEntries(USAGE_EVENTS.map((event) => [event, whole])),
}

const dayCounts = {
  type: 'object',
  required: ['day', ...USAGE_EVENTS],
  properties: { day: { type: 'string', format: 'date' }, ...eventCounts.properties },
}

const usagePage = {
  type: 'object',
  required: ['totals', 'recent', 'days', 'familiesPlayed'],
  properties: {
    totals: eventCounts,
    recent: eventCounts,
    // Oldest first, one entry per day with no gaps, so a chart can draw it as it comes.
    days: { type: 'array', items: dayCounts },
    familiesPlayed: whole,
  },
}

/**
 * The admin's Uso page (JUG-199). The admin has no login yet, so this route
 * is public, and app.js registers it only when ADMIN_ENABLED turns the admin
 * on.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ controller: UsageController }} options
 */
export async function adminUsageRoutes(app, { controller }) {
  const config = { access: 'public' }
  app.get('/admin/usage', { config, schema: { response: { 200: usagePage, 500: errorBody } } }, controller.counts)
}
