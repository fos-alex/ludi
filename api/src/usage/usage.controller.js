/** @typedef {import('./usage.service.js').UsageService} UsageService */
/** @typedef {ReturnType<typeof createUsageController>} UsageController */

/** The admin's Uso page (JUG-199). @param {{ usage: UsageService }} deps */
export function createUsageController({ usage }) {
  return {
    /** Every number the page draws, in one answer. @type {import('fastify').RouteHandlerMethod} */
    async counts() {
      return usage.counts()
    },
  }
}
