/**
 * The shapes the activity screens work with, as the API sends them.
 */

/**
 * @typedef {{
 *   id: string, title: string, minutes: number, place: 'indoor' | 'outdoor',
 *   why: string, needs: string, steps: string[], easier: string, harder: string,
 *   game?: Game | null, materials?: string[], reaction: 'up' | 'down' | null,
 * }} Activity
 * `needs` starts lowercase so a toy name at the start keeps its family spelling;
 * the layout capitalises the sentence where it needs to. `game` is the
 * discovery game Empezar opens instead of the timer (JUG-177); a juego cached
 * before it has none. `materials` are the keys of what it can't be played
 * without (JUG-196), which is what Con lo mismo picks the next juego from, and
 * a juego cached before it has none either. `reaction` is the feedback tap
 * (JUG-23): how the juego went, or null while the parent hasn't said.
 */
/**
 * @typedef {{ type: 'sounds', set: string, rounds: Round[] }} Game
 * ¿Qué suena? (JUG-177): five rounds from one sound set, dealt by the API for
 * the kids playing.
 */
/**
 * @typedef {{
 *   sound: string, options: string[], answer: number,
 *   credit: { author: string, license: string, source: string } | null,
 * }} Round
 * `sound` is the recording's name in its set, `options` are the words the
 * parent reads, and `answer` is the index of the right one. `credit` is there
 * only when the recording's license asks for it.
 */
/**
 * @typedef {'calm' | 'lively'} Mood
 * What the family is up for: tranqui winds the kids down, con pilas gets them moving (JUG-26).
 */
/**
 * @typedef {'move' | 'create' | 'pretend' | 'explore' | 'learn' | 'helpers'} Category
 * The kinds of play a parent can ask for (JUG-30, JUG-31). The catalog's other two, low
 * energy and out and about, are what Tranqui and Afuera already ask for.
 */
/**
 * @typedef {{
 *   mood: Mood | null, place: Activity['place'] | null, sound: boolean | null, category: Category | null,
 * }} Choices
 * What the parent asked the next juego to be (JUG-31), each null for any. `mood` is Tranqui
 * or Con pilas (JUG-26), and `sound` whether the juego plays sound on the phone.
 */
/**
 * @typedef {Choices & { until: number }} StoredChoices
 * The parent's own taps, which hold until the next 19:00 or 07:00, in epoch milliseconds.
 */
/**
 * @typedef {{
 *   weather: 'fine' | 'fair' | 'poor',
 *   reason: 'clear' | 'rain' | 'storm' | 'cold' | 'heat' | 'wind' | 'fog' | 'grey',
 *   night: boolean,
 * }} Outside
 * The weather the next juego is picked for (JUG-191), as the ranking reads
 * it: `fine` favours a juego outside, `poor` one inside, and `fair` changes
 * nothing. `reason` says what decided it. At `night` the juego is inside
 * whatever the weather.
 */
/**
 * @typedef {Outside & { at: number }} StoredOutside
 * The last answer, and when it came, in epoch milliseconds.
 */
/**
 * @typedef {{ from: string, activityId: string | null }} Chain
 * Con lo mismo (JUG-196): the juego to play next with the materials `from` needed.
 * `activityId` is null when nothing in the catalog continues it, which is remembered
 * so the card stops asking.
 */
/**
 * @typedef {{ activityId: string, endsAt: number }} Timer
 * The juego being played, from Empezar until Terminamos. `endsAt` is in epoch milliseconds.
 */

export {}
