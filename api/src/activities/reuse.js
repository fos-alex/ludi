/**
 * Con lo mismo (JUG-196): the next juego played with the materials already
 * out. Setting up costs more than playing — the sheets, the tape, the boxes
 * take longer to gather than the ten minutes of juego they buy — so once a
 * family has gathered something, Ludi offers a second juego that uses it.
 *
 * A juego can follow another when it needs **at most one material the first
 * one didn't**, and **shares at least one** with it: nothing more to fetch
 * than one thing, and what is on the floor gets used. A juego that needs no
 * materials can't start a chain and can't continue one, since there is
 * nothing to reuse.
 *
 * Nothing else about the ranking changes: what this leaves is ranked as any
 * other suggestion is, with the juego being left out of it as always.
 */

/** @typedef {import('../catalog/catalog.service.js').FillableActivityTemplate} Template */
/** @typedef {import('../catalog/slots.js').Fill} Fill */

/** How many materials a juego may need that the one before it didn't. */
export const EXTRA = 1

/**
 * The candidates that can be played with the materials already out.
 * @template {{ template: Template, fill: Fill }} C
 * @param {C[]} candidates the templates that fit the family
 * @param {string[]} materials the keys the juego being continued needed
 * @returns {C[]} empty when nothing in the catalog continues it
 */
export function reusing(candidates, materials) {
  const out = new Set(materials)
  if (out.size === 0) return []
  return candidates.filter(({ template }) => {
    let shared = 0
    let extra = 0
    for (const key of template.materials) {
      if (out.has(key)) shared += 1
      else extra += 1
    }
    return shared > 0 && extra <= EXTRA
  })
}
