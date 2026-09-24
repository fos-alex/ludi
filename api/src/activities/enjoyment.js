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
 * key, past the timeout, and on any error it answers null, and the ranking
 * works as it did before.
 */

/** @typedef {import('../jev/typesafe.js').Jev} Jev */
/** @typedef {import('../jev/typesafe.js').Noul} Noul */
/** @typedef {import('../families/families.service.js').Profile} Profile */
/** @typedef {import('../catalog/catalog.service.js').FillableActivityTemplate} Template */
/** @typedef {ReturnType<typeof createEnjoyment>} Enjoyment */

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
 * @param {{ jev: Jev | null, logger?: { warn: (message: string) => void } }} deps
 */
export function createEnjoyment({ jev, logger }) {
  return {
    /**
     * The probability that the kids playing would enjoy each template, by
     * template id, or null when there is nothing to say.
     * @param {Profile} profile the playing profile: only the kids playing
     * @param {Template[]} templates
     * @returns {Promise<Map<string, number> | null>}
     */
    async of(profile, templates) {
      if (!jev || templates.length === 0) return null
      try {
        const nouls = await jev.nouls({
          state: stateOf(profile),
          questions: Object.fromEntries(templates.map((template, at) => [`t${at}`, questionFor(template)])),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        /** @type {Map<string, number>} */
        const byTemplate = new Map()
        templates.forEach((template, at) => {
          const noul = nouls.get(`t${at}`)
          if (noul !== undefined) byTemplate.set(template.id, noul)
        })
        return byTemplate
      } catch (error) {
        // The message names the failure and never what was asked.
        logger?.warn(`Jev could not be read: ${/** @type {Error} */ (error).message}`)
        return null
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
