/**
 * The app's local state, persisted in localStorage so it survives reloads and
 * stays readable offline. One key per piece of state (see KEYS); components
 * subscribe with useStored(key). The real API will write through here too,
 * which is what keeps the last idea and the open story available offline.
 */
import { useSyncExternalStore } from 'react'

/**
 * One key per piece of state, grouped by the feature whose api.js writes it.
 * Two writes cross over: `request` in http.js clears everything and sets
 * `sessionEnded` when the API ends the session, and the toy box keeps the
 * family's toys in step with its own.
 * @typedef {AccountKey | FamilyKey | VoiceKey | ToysKey | MaterialsKey | ActivitiesKey | StoriesKey | HistoryKey | AppKey} Key
 */
/** @typedef {'account' | 'sessionEnded'} AccountKey */
/** @typedef {'family' | 'familyDraft' | 'parseResult'} FamilyKey */
/** @typedef {'voiceIntroSeen'} VoiceKey Whether this device has seen the mic spotlighted on 2d. */
/** @typedef {'toyBox'} ToysKey */
/** @typedef {'materials'} MaterialsKey The categories of household materials, as the API last sent them. */
/**
 * @typedef {'activities' | 'lastActivityId' | 'chain' | 'timer' | 'activityChoices' | 'outside'} ActivitiesKey
 * `activityChoices` is what the parent chose in ¿Algo en especial? (JUG-31), Tranqui and Con
 * pilas included (JUG-26), which holds until the next 19:00 or 07:00; without it the clock
 * decides. `chain` is the juego to play next with the materials the last one needed, and
 * which juego that is for (JUG-196). `outside` is the weather the next juego is picked for,
 * as Home's corner shows it (JUG-191).
 */
/**
 * @typedef {'storyOptions' | 'stories' | 'storyPositions' | 'series' | 'lastStoryId' | 'storyRequest'} StoriesKey
 * `storyRequest` is the story the parent asked for and said yes to, until it is written (JUG-156).
 */
/** @typedef {'history'} HistoryKey The juegos played and the stories read, as the API last sent them (JUG-188). */
/** @typedef {'theme'} AppKey The night-mode choice, written by app/ThemeProvider.jsx. */

const PREFIX = 'ludi:'
const cache = new Map()
const listeners = new Set()

/** @param {Key} key */
function load(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function notify() {
  for (const listener of listeners) listener()
}

/** @param {Key} key */
export function read(key) {
  if (!cache.has(key)) cache.set(key, load(key))
  return cache.get(key)
}

/** @param {Key} key @param {unknown} value `null` removes the key */
export function write(key, value) {
  cache.set(key, value ?? null)
  try {
    if (value == null) localStorage.removeItem(PREFIX + key)
    else localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the in-memory value still holds for this session.
  }
  notify()
}

/** Forgets everything except the listed keys. @param {Key[]} keep */
export function clearAll(keep = []) {
  for (const name of Object.keys(localStorage)) {
    if (name.startsWith(PREFIX) && !keep.includes(/** @type {Key} */ (name.slice(PREFIX.length)))) {
      localStorage.removeItem(name)
    }
  }
  for (const key of [...cache.keys()]) if (!keep.includes(key)) cache.delete(key)
  notify()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** @param {Key} key */
export function useStored(key) {
  return useSyncExternalStore(subscribe, () => read(key))
}
