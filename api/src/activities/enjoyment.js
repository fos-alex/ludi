/**
 * Whether the kids playing would enjoy each juego that fits them, as Jev
 * reads it (JUG-200). One call per suggestion: the state is the kids, and
 * each template is one yes/no question, so the answer is a probability for
 * every candidate at once. The ranking multiplies it in (ranking.js), beside
 * the themes it already matches by word stems: Jev reads what the kids love
 * against what the juego is, so "le encanta cocinar" can reach a juego in the
 * kitchen that no theme names.
 *
 * **No names go to Jev.** The state holds each kid's age and what they love,
 * and the templates go with their slots unfilled: `{kid}`, not the kid's name.
 *
 * **It never fails a suggestion, and never holds one up for long.** Without a
 * key, past the timeout, and on any error there are no ratings, and the
 * ranking works as it did before.
 *
 * **Every call is recorded** in `jev_calls`, with its ratings in `jev_ratings`,
 * tied to the suggestion it was made for, so how Jev rates each juego can be
 * read back in SQL beside what won and what the parent thought of it.
 */
import { performance } from 'node:perf_hooks'
import { jevCalls, jevRatings } from './activities.schema.js'

/** @typedef {import('../jev/typesafe.js').Jev} Jev */
/** @typedef {import('../jev/typesafe.js').Noul} Noul */
/** @typedef {import('../families/families.service.js').Profile} Profile */
/** @typedef {import('../catalog/catalog.service.js').FillableActivityTemplate} Template */
/** @typedef {import('../db/client.js').Db} Db */
/** @typedef {ReturnType<typeof createEnjoyment>} Enjoyment */
/**
 * @typedef {object} Read what one call to Jev came back with
 * @property {Map<string, number> | null} byTemplate the probability for each template, by id; null when the call failed
 * @property {string | null} model the versioned id that answered
 * @property {number | null} inputTokens
 * @property {number} durationMs
 * @property {string | null} error the kind of failure, never what was sent
 */

/**
 * ¡Juguemos! is one tap. Jev answers in well under a second, so past this the
 * juego is offered without it.
 */
const TIMEOUT_MS = 1500

/**
 * The question, in English, which Jev reads best (docs.typesafe.ai/models).
 * The juegos are in Spanish, and so are the kids' interests.
 */
const QUESTION = 'Would the kids in `kids` enjoy playing `juego`, given what each of them loves and how old they are?'
const CRITERIA = {
  true: 'The juego is about, or uses, something a kid loves, or it is the kind of play kids their age ask to do again.',
  false: 'The juego has nothing to do with what the kids love, and nothing about it would especially appeal to kids their age.',
}
const NOTE =
  'Each juego is a template for a parent to play with the kids. Words in braces, such as {kid}, {pet}, or {toy}, are filled in later with the family’s own names.'

/**
 * @param {{
 *   jev: Jev | null,
 *   db?: Db | null,
 *   logger?: { warn: (message: string) => void, error: (details: object, message: string) => void } | null,
 * }} deps `db` is where each call is recorded; without it nothing is.
 */
export function createEnjoyment({ jev, db = null, logger = null }) {
  return {
    /**
     * What Jev says about each template for the kids playing, or null when
     * it wasn't asked: no Jev, or nothing to ask about.
     * @param {Profile} profile the playing profile: only the kids playing
     * @param {Template[]} templates
     * @returns {Promise<Read | null>}
     */
    async of(profile, templates) {
      if (!jev || templates.length === 0) return null
      const started = performance.now()
      const took = () => Math.round(performance.now() - started)
      try {
        const answer = await jev.nouls({
          state: stateOf(profile),
          questions: Object.fromEntries(templates.map((template, at) => [`t${at}`, questionFor(template)])),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        /** @type {Map<string, number>} */
        const byTemplate = new Map()
        templates.forEach((template, at) => {
          const noul = answer.nouls.get(`t${at}`)
          if (noul !== undefined) byTemplate.set(template.id, noul)
        })
        return { byTemplate, model: answer.model, inputTokens: answer.inputTokens, durationMs: took(), error: null }
      } catch (error) {
        // The message names the failure and never what was asked.
        const message = /** @type {Error} */ (error).message
        logger?.warn(`Jev could not be read: ${message}`)
        return { byTemplate: null, model: null, inputTokens: null, durationMs: took(), error: message }
      }
    },

    /**
     * Keeps a call and what Jev answered for each template, for reading Jev's
     * ratings back in SQL. A juego must never fail because of it, so a
     * failed insert is logged and let go; without a logger it throws, which
     * is what a test wants.
     * @param {{ familyId: string, activityId: string, read: Read }} call
     */
    async record({ familyId, activityId, read }) {
      if (!db) return
      try {
        await db.transaction(async (tx) => {
          const [{ id }] = await tx
            .insert(jevCalls)
            .values({
              familyId,
              activityId,
              model: read.model,
              inputTokens: read.inputTokens,
              durationMs: read.durationMs,
              error: read.error,
            })
            .returning({ id: jevCalls.id })
          const ratings = [...(read.byTemplate ?? [])].map(([templateId, noul]) => ({ callId: id, templateId, noul }))
          if (ratings.length > 0) await tx.insert(jevRatings).values(ratings)
        })
      } catch (error) {
        if (!logger) throw error
        logger.error({ err: error }, 'the Jev call was not recorded')
      }
    },
  }
}

/**
 * The kids playing, as Jev sees them: an age in words, since Jev is no
 * calculator, and what each loves, with no name.
 * @param {Profile} profile
 */
export function stateOf(profile) {
  return {
    note: NOTE,
    kids: profile.kids.map((kid) => ({ age: ageInWords(kid.ageMonths), loves: kid.interests })),
  }
}

/**
 * One template as a question, with its slots unfilled.
 * @param {Template} template
 * @returns {Noul}
 */
export function questionFor(template) {
  return {
    instructions: {
      juego: {
        title: template.title,
        why: template.why,
        steps: template.steps,
        categories: template.categories,
        themes: template.themes,
      },
      question: QUESTION,
    },
    criteria: CRITERIA,
  }
}

/** @param {number | null} months */
export function ageInWords(months) {
  if (months == null) return 'not given'
  if (months < 24) return `${months} months old`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest === 0 ? `${years} years old` : `${years} years and ${rest} months old`
}
