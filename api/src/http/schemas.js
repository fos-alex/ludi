/**
 * Schema fragments the routes share. A response schema is also the allowlist
 * of what leaves the server, so a fragment used in one says exactly what a
 * field is, and the same fragment in a body says what is accepted.
 */

/** An id, which is always a UUID. */
export const uuid = { type: 'string', format: 'uuid' }

/** A line of text someone typed, never empty. @param {number} maxLength */
export const text = (maxLength) => ({ type: 'string', minLength: 1, maxLength })

/**
 * The most a parent's own words can run to, typed or spoken: five minutes of
 * talking is about 6000 characters, so this leaves room for both. The web caps
 * its text boxes at the same number (`LONG_TEXT` in web/src/features/family/model.js).
 */
export const LONG_TEXT = 10_000

/** A list of lines, such as a template's steps. @param {number} maxItems @param {number} [minItems] */
export const lines = (maxItems, minItems = 0) => ({ type: 'array', minItems, maxItems, items: text(300) })

/**
 * The body every failure answers with, from `handleError` in app.js: the
 * message, plus the code when the client has to tell one failure from another.
 */
export const errorBody = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string' }, code: { type: 'string' } },
}
