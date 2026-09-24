/**
 * Google Analytics 4, spoken from here rather than from the browser (JUG-198).
 *
 * GA4's Measurement Protocol takes events over HTTP, so the web app ships no
 * tracking script and loads no extra bytes. It also suits what we count:
 * every one of the six is something the server does, not something a screen
 * knows about.
 *
 * What Google is sent is an event name and nothing else about the family.
 * `client_id` is an HMAC of the family's id under the server's secret, so GA4
 * can tell families apart and count returning use without ever holding an id
 * of ours, and the mapping can't be undone from Google's side. No name, no
 * email, no age, no story or juego text. Ads personalisation is switched off
 * on every event, which the constitution's privacy guardrail requires.
 *
 * Nothing here is awaited by a request and nothing here throws: a parent's
 * juego must not wait on Google, or fail because Google did.
 */
import { createHmac } from 'node:crypto'

/** @typedef {import('../config.js').AnalyticsConfig} AnalyticsConfig */
/** @typedef {import('./usage.schema.js').USAGE_EVENTS[number]} UsageEvent */
/** @typedef {ReturnType<typeof createGa>} Ga */

const COLLECT_URL = 'https://www.google-analytics.com/mp/collect'

/**
 * The debug endpoint, which is the only one that answers with what is wrong
 * with a payload; the real one always answers 204. ANALYTICS_DEBUG points
 * here, and what it says is logged.
 */
const DEBUG_URL = 'https://www.google-analytics.com/debug/mp/collect'

/** Long enough for a round trip, short enough to never pile up. */
const TIMEOUT_MS = 2000

/**
 * Where a family with no id of its own is counted from, so the events before
 * a family exists still belong to somebody.
 */
const NOBODY = 'anonymous'

/**
 * @param {{
 *   config: AnalyticsConfig,
 *   secret: string,
 *   logger?: { error: (details: object, message: string) => void, info: (details: object, message: string) => void } | null,
 *   fetch?: typeof globalThis.fetch,
 *   now?: () => Date,
 * }} deps `secret` is the server's own, which the ids are derived under;
 *   `fetch` and `now` are here for the tests.
 */
export function createGa({ config, secret, logger = null, fetch = globalThis.fetch, now = () => new Date() }) {
  const url = new URL(config.debug ? DEBUG_URL : COLLECT_URL)
  url.searchParams.set('measurement_id', config.measurementId)
  url.searchParams.set('api_secret', config.apiSecret)

  /** A stable pseudonym for whoever this is, in the two-number shape GA4 expects. @param {string} id */
  const pseudonym = (id) => {
    const digest = createHmac('sha256', secret).update(id).digest('hex')
    return `${BigInt(`0x${digest.slice(0, 10)}`)}.${BigInt(`0x${digest.slice(10, 20)}`)}`
  }

  /**
   * One session per family per day, so GA4's reports fill in. Buenos Aires,
   * not UTC: a story read at nine at night belongs to that evening, and in
   * UTC it would land on the next day.
   */
  const sessionId = () => Math.floor(Date.parse(`${dayIn(now())}T00:00:00Z`) / 1000)

  return {
    /**
     * Sends one event, and forgets about it. Returns the promise only so the
     * tests can wait for it; callers don't.
     * @param {UsageEvent} event
     * @param {{ familyId?: string | null, userId?: string | null }} [who]
     * @returns {Promise<void>}
     */
    async send(event, { familyId = null, userId = null } = {}) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          body: JSON.stringify({
            client_id: pseudonym(familyId ?? userId ?? NOBODY),
            // Ludi never advertises to a family, and Google is told so on every event.
            non_personalized_ads: true,
            events: [
              {
                name: event,
                // GA4 drops an event with no engagement time, and files one
                // with no session under no session at all.
                params: { session_id: sessionId(), engagement_time_msec: '1' },
              },
            ],
          }),
        })
        if (config.debug) {
          logger?.info({ event, status: response.status, body: await response.text() }, 'GA4 checked an event')
        }
      } catch (error) {
        logger?.error({ err: error, event }, 'GA4 did not take an event')
      }
    },
  }
}

/** The day a moment falls on where the families are. @param {Date} at */
function dayIn(at) {
  return at.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}
