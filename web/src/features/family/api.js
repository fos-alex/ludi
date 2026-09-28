/**
 * The family profile, against the real API. The screens keep 0.1's shape (one
 * pet, toys by name and id) and this module translates to and from the API's,
 * which has room for more pets. The rest of what is known about each toy is
 * the toy box's (./toys).
 */
import { read, write } from '../../shared/store'
import { track } from '../../shared/analytics'
import { ApiError, request, WordedError } from '../../shared/http'
import { DEFAULT_CALLED_AS, DEFAULT_PET_KIND } from './model'

/** @typedef {import('./types').Family} Family */
/** @typedef {import('./types').FamilyInput} FamilyInput */
/** @typedef {import('./types').Kid} Kid */
/**
 * @typedef {Omit<Kid, 'ageMonths' | 'interests'> & { ageMonths?: number | null, age?: number | null, interests?: string[] }} CachedKid
 * A kid as an older version of the app cached it: its age in whole years, and
 * no interests of its own.
 */
/**
 * @typedef {{
 *   home?: import('./types').Home | null,
 *   location?: import('./types').Location | null,
 *   parents?: { id?: string, name: string, calledAs: string | null }[],
 *   kids: { id?: string, name: string, ageMonths: number | null, playing?: boolean, interests?: string[] }[],
 *   pets: { name: string, kind?: import('./types').PetKind | null }[], toys?: { id?: string, name: string }[],
 * }} Profile
 * The understanding endpoint's family has no home and no location, and says
 * null for what the kids call a parent, or for a pet's animal, when the words
 * didn't say.
 */

/** @param {Profile} profile @returns {Family} */
function toFamily(profile) {
  return {
    parents: (profile.parents ?? []).map(({ id, name, calledAs }) => ({ id, name, calledAs: calledAs ?? DEFAULT_CALLED_AS })),
    kids: profile.kids.map(({ id, name, ageMonths, playing, interests = [] }) => ({ id, name, ageMonths, playing, interests })),
    pet: profile.pets[0]?.name ?? '',
    petKind: profile.pets[0]?.kind ?? DEFAULT_PET_KIND,
    home: profile.home ?? null,
    location: profile.location ?? null,
    toys: (profile.toys ?? []).map(({ id, name }) => ({ id, name })),
  }
}

/**
 * Parents, kids, and toys keep their ids, so the API updates them instead of
 * adding new ones: a kid keeps who's playing, and a toy keeps what the toy box
 * knows. A family without toys leaves the toys as they are.
 * @param {FamilyInput} family @returns {Profile}
 */
function toProfile(family) {
  return {
    home: family.home,
    // Their own words; the API looks up where that is and says if it found it
    // (JUG-25). A form without the field sends none and the API keeps it.
    ...(family.location !== undefined && { location: family.location }),
    parents: family.parents.map(({ id, name, calledAs }) => (id ? { id, name, calledAs } : { name, calledAs })),
    kids: family.kids.map(({ id, name, ageMonths, interests }) =>
      id ? { id, name, ageMonths, interests } : { name, ageMonths, interests },
    ),
    pets: family.pet ? [{ name: family.pet, kind: family.petKind }] : [],
    ...(family.toys && { toys: family.toys.map(({ id, name }) => (id ? { id, name } : { name })) }),
  }
}

/**
 * Brings a family cached by an older version up to date until the next load
 * replaces it: toys cached as bare names become toys without ids, the family's
 * own interests, from before each kid had theirs (JUG-144), go to every kid, as
 * the API's migration did, an age in whole years becomes months (JUG-145), and
 * a family from before the parents, the pet's animal, and the home (JUG-21)
 * gets none, a dog, and no home.
 */
export function upgradeCachedFamily() {
  const family = read('family')
  if (!family) return
  const bareToys = family.toys.some((/** @type {unknown} */ toy) => typeof toy === 'string')
  const yearsOnly = family.kids.some((/** @type {CachedKid} */ kid) => kid.ageMonths === undefined)
  const noDetails = !family.parents
  if (!bareToys && !yearsOnly && !noDetails && !Array.isArray(family.interests)) return
  const { interests = [], ...rest } = family
  write('family', {
    parents: [],
    petKind: DEFAULT_PET_KIND,
    home: null,
    ...rest,
    kids: family.kids.map((/** @type {CachedKid} */ kid) => {
      const { age, ...kept } = kid
      return {
        ...kept,
        ageMonths: kid.ageMonths ?? (typeof age === 'number' ? age * 12 : null),
        interests: kid.interests ?? interests,
      }
    }),
    toys: family.toys.map((/** @type {string | import('./types').FamilyToy} */ toy) => (typeof toy === 'string' ? { name: toy } : toy)),
  })
}

/** Brings the account's family into this browser, or forgets it if there is none yet. @returns {Promise<Family | null>} */
export async function loadFamily() {
  try {
    const family = toFamily(await request('GET', '/family'))
    write('family', family)
    return family
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error
    write('family', null)
    return null
  }
}

/**
 * Sends the parent's own words to the API, whose LLM reads the family in them,
 * and keeps the result for the review card. Nothing is saved until the parent
 * confirms it.
 * @param {string} text
 * @returns {Promise<import('./types').ParseResult>}
 */
export async function understandFamily(text) {
  const { family, unsure, note } = await request('POST', '/family/understanding', { text })
  /** @type {import('./types').ParseResult} */
  const parse = { family: toFamily(family), flagged: unsure, note }
  write('parseResult', parse)
  return parse
}

/** This server has no LLM to read the parent's words with: a state to word plainly, not a failure. */
export class UnderstandingOffError extends WordedError {
  constructor() {
    // Voice pass pending.
    super('No puedo leer lo que me contás por ahora. Escribilo y listo.')
  }
}

/** The words said nothing about the family, which is an answer and not a failure either. */
export class NothingHeardError extends WordedError {
  constructor() {
    // Voice pass pending.
    super('No escuché nada para cambiar. ¿Probamos de nuevo?')
  }
}

/**
 * Reads what the parent just said about their family, for the edit form to
 * fold into what it already has (JUG-103). Unlike onboarding it keeps
 * nothing: the form the parent is looking at is where the change waits, and
 * "Guardar" is what saves it.
 * @param {string} text
 * @returns {Promise<import('./model').HeardFamily>}
 */
export async function understandChanges(text) {
  let heard
  try {
    heard = await request('POST', '/family/understanding', { text })
  } catch (error) {
    if (error instanceof ApiError && error.code === 'LLM_OFF') throw new UnderstandingOffError()
    throw error
  }
  const family = toFamily(heard.family)
  if (family.parents.length === 0 && family.kids.length === 0 && !family.pet && family.toys.length === 0) throw new NothingHeardError()
  // What the words didn't say stays unsaid, so the form keeps what it has.
  const { parents = [], pets } = /** @type {Profile} */ (heard.family)
  return { ...family, parents, petKind: pets[0]?.kind ?? null }
}

/** @param {FamilyInput} family @returns {Promise<Family>} */
export async function saveFamily(family) {
  // With no family in this browser yet, this save is the one that starts it.
  // GA's count is only as good as that guess; the Uso page's is the API's own.
  const starting = !read('family')
  const saved = toFamily(await request('PUT', '/family', toProfile(family)))
  if (starting) track('family_created')
  write('family', saved)
  write('parseResult', null)
  write('familyDraft', null)
  return saved
}

/**
 * Says which kids are playing, for this parent on every device; the rest sit
 * out. Juegos and stories are for these kids until the parent changes it.
 * @param {string[]} kidIds
 * @returns {Promise<Family>}
 */
export async function choosePlaying(kidIds) {
  const family = toFamily(await request('PUT', '/family/playing', { kids: kidIds }))
  write('family', family)
  return family
}

/** Keeps what the parent has written on 2d so far, so a reload doesn't lose it. @param {string} text */
export function keepDraft(text) {
  write('familyDraft', text)
}

/** A voice note's words go after whatever is already in the draft. @param {string} text */
export function addToDraft(text) {
  const current = read('familyDraft')?.trim()
  write('familyDraft', current ? `${current} ${text}` : text)
}

/**
 * Shows who's playing on this device at once, before `choosePlaying` saves it.
 * @param {Kid[]} kids
 */
export function markPlaying(kids) {
  const family = read('family')
  if (family) write('family', { ...family, kids })
}
