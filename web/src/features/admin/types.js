/**
 * The shapes the catalog admin works with, as the API sends them.
 */

/**
 * @typedef {{
 *   title: string, active: boolean, rating: number, minutes: number, place: 'indoor' | 'outdoor',
 *   minAgeMonths: number, maxAgeMonths: number, energy: 'low' | 'medium' | 'high',
 *   categories: string[], smallSpace: boolean, materials: string[], themes: string[], skills: string[], safety: string[],
 *   why: string, needs: string, steps: string[], easier: string, harder: string,
 * }} ActivityTemplateFields
 * A catalog template as the admin edits it, with its slots ({kid}, {toy}…) unfilled.
 * `materials` are keys from the API's list: what it can't be played without.
 * `themes` are keys from the API's list too: what it is about (JUG-104).
 * `rating` is 1 to 5, what every family's ranking starts from (JUG-192).
 */
/**
 * @typedef {{ ups: number, downs: number, rating: number }} Reactions
 * Every family's thumbs up and down for a template, and its rating now: the
 * admin's, moved by those reactions, 1 to 5 (JUG-192).
 */
/**
 * @typedef {ActivityTemplateFields & { id: string, slug: string, updatedAt: string, reactions: Reactions }} ActivityTemplate
 */
/**
 * @typedef {{ key: string, label: string, materials: { key: string, label: string }[] }} MaterialCategory
 * The materials a template can name, by category (JUG-153).
 */

/** @typedef {{ key: string, label: string }} Theme What a template can be about (JUG-104). */

/** @typedef {{ id: string, name: string, email: string, createdAt: string }} AdminAccount An account, as the Usuarios page lists it. */

/**
 * @typedef {{ id: string, email: string, status: 'pending' | 'expired' | 'accepted', sentAt: string, expiresAt: string }} Invitation
 * An invitation to sign up (JUG-34). `accepted` once the email has an account.
 */

/**
 * @typedef {Invitation & { link: string | null }} SentInvitation
 * An invitation just sent. `link` is only there when email is off and nothing
 * was sent, so the link can be passed on by hand.
 */

/**
 * @typedef {'juego_shown' | 'juego_played' | 'story_told' | 'series_started' | 'account_created' | 'family_created'} UsageEvent
 * The six things the API counts (JUG-198).
 */

/** @typedef {Record<UsageEvent, number>} EventCounts One number per event, all six always there. */

/** @typedef {{ day: string } & EventCounts} DayCounts One day, as `YYYY-MM-DD` in Buenos Aires. */

/**
 * @typedef {object} Usage what the Uso page draws (JUG-199)
 * @property {EventCounts} totals since the beginning
 * @property {EventCounts} recent the last seven days
 * @property {DayCounts[]} days one entry per day for the last three months, oldest first, with no gaps
 * @property {number} familiesPlayed how many families have played at least one juego
 */

export {}
