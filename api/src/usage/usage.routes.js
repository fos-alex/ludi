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

const analytics = {
  type: 'object',
  required: ['measurementId', 'debug'],
  properties: { measurementId: { type: ['string', 'null'] }, debug: { type: 'boolean' } },
}

/**
 * The GA4 stream the web app reports to (JUG-201), or null when there is none.
 * Public: the pages before an account exists are the ones the funnel starts
 * on, and a measurement ID is no secret, since GA puts it in every page it
 * runs on.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ controller: UsageController }} options
 */
export async function usageRoutes(app, { controller }) {
  app.get('/analytics', { config: { access: 'public' }, schema: { response: { 200: analytics } } }, controller.analytics)
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
