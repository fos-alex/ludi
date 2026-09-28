/** @typedef {import('./usage.service.js').UsageService} UsageService */
/** @typedef {import('../config.js').AnalyticsConfig} AnalyticsConfig */
/** @typedef {ReturnType<typeof createUsageController>} UsageController */

/**
 * The admin's Uso page (JUG-199), and the GA4 stream the web reports to (JUG-201).
 * @param {{ usage: UsageService, analytics?: AnalyticsConfig | null }} deps
 */
export function createUsageController({ usage, analytics = null }) {
  return {
    /** Whether the web loads GA, and for which stream. @type {import('fastify').RouteHandlerMethod} */
    async analytics() {
      return { measurementId: analytics?.measurementId ?? null, debug: analytics?.debug ?? false }
    },

    /** Every number the page draws, in one answer. @type {import('fastify').RouteHandlerMethod} */
    async counts() {
      return usage.counts()
    },
  }
}
