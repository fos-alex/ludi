/**
 * TypeSafe's System One API, which serves the Jev model (JUG-200). Jev writes
 * no text: it takes a state and typed questions and answers each one with a
 * number, in one call. Ludi asks only yes/no questions (`noul`), so that is
 * all this client speaks. Server-side only: the browser never sees the key.
 * Without a key there is no client, and the ranking works without it.
 *
 * **The state is the family's, so it never reaches a log.** A failure is an
 * `UpstreamError` naming what went wrong and never what was asked.
 */
import { UpstreamError } from '../errors.js'

/** @typedef {import('../config.js').JevConfig} JevConfig */
/**
 * A yes/no question: `instructions` is the question, or an object holding it
 * with the data it refers to; `criteria` says what a yes and a no mean.
 * @typedef {{ instructions: string | object, criteria?: { true: string, false: string } }} Noul
 */
/**
 * @typedef {object} Jev
 * @property {(call: { state: object, questions: Record<string, Noul>, signal?: AbortSignal }) => Promise<Map<string, number>>} nouls
 *   the probability of a yes for each question, by the key it was asked under
 */

const USER_AGENT = 'ludi-api/0.1'

/**
 * @param {{ config: JevConfig }} deps
 * @returns {Jev | null} null without a key
 */
export function createJev({ config }) {
  if (!config.apiKey) return null
  const url = `${config.url.replace(/\/$/, '')}/systemone`

  return {
    async nouls({ state, questions, signal }) {
      const body = {
        model: config.model,
        state,
        questions: Object.fromEntries(Object.entries(questions).map(([key, question]) => [key, { type: 'noul', ...question }])),
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify(body),
        signal,
      }).catch((error) => {
        throw new UpstreamError(`Jev is unreachable (${error.name})`)
      })
      // The body of a 422 can quote the state, so only the status is kept.
      if (!response.ok) throw new UpstreamError(`Jev answered HTTP ${response.status}`)
      const data = /** @type {{ answers?: Record<string, { noul?: unknown }> } | null} */ (
        await response.json().catch(() => null)
      )

      /** @type {Map<string, number>} */
      const nouls = new Map()
      for (const key of Object.keys(questions)) {
        const noul = data?.answers?.[key]?.noul
        if (typeof noul === 'number' && Number.isFinite(noul)) nouls.set(key, Math.min(1, Math.max(0, noul)))
      }
      if (nouls.size === 0) throw new UpstreamError('Jev answered with no nouls')
      return nouls
    },
  }
}
