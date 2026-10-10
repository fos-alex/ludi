/**
 * The family's logic, with no React: the family in words, and the family
 * form's state and how it maps to and from the family.
 */

/** @typedef {import('./types').Family} Family */
/** @typedef {import('./types').FamilyInput} FamilyInput */
/** @typedef {import('./types').FamilyToy} FamilyToy */
/** @typedef {import('./types').Home} Home */
/** @typedef {import('./types').Kid} Kid */
/** @typedef {import('./types').Parent} Parent */
/** @typedef {import('./types').PetKind} PetKind */
/**
 * @typedef {{
 *   parents: Parent[],
 *   kids: { id?: string, name: string, years: string, months: string, interests: string[] }[],
 *   pet: string, petKind: PetKind, home: Home | null, location: string | null,
 *   toys: FamilyToy[] | null,
 * }} FormState
 * The family form (2h) as typed: the years and the months of each age stay
 * text until saved (JUG-145). `location` is where they live in their own
 * words (JUG-25). `toys` is null when the form doesn't show them, which is
 * everywhere but onboarding: the toy box is where toys live (JUG-21).
 */
/**
 * @typedef {Omit<Family, 'petKind' | 'parents'> & { petKind: PetKind | null, parents: { name: string, calledAs: string | null }[] }} HeardFamily
 * What the API read in a note about what changed: an animal, or what the kids
 * call a parent, is null when the note didn't say.
 */

/** A pet is a dog until the family says otherwise (JUG-21). */
export const DEFAULT_PET_KIND = /** @type {PetKind} */ ('perro')

/** What the kids call a parent until the family says otherwise (JUG-21). */
export const DEFAULT_CALLED_AS = 'Mamá'

/**
 * The most the parent's words on 2d can run to: room for five minutes of
 * talking and some typing. It must match `LONG_TEXT` in api/src/http/schemas.js,
 * or a long text fails to send.
 */
export const LONG_TEXT = 10_000

/**
 * The animals a pet can be, in the order the form offers them, each with the
 * emoji the picker shows beside its word. The emoji is the one place the app
 * steps outside its own icon set: the animals read at a glance and the set
 * doesn't have to grow a drawing per animal. Voice pass pending.
 */
export const PET_KINDS = /** @type {{ key: PetKind, label: string, emoji: string }[]} */ ([
  { key: 'perro', label: 'Perro', emoji: '🐶' },
  { key: 'gato', label: 'Gato', emoji: '🐱' },
  { key: 'pajaro', label: 'Pájaro', emoji: '🐦' },
  { key: 'pez', label: 'Pez', emoji: '🐠' },
  { key: 'conejo', label: 'Conejo', emoji: '🐰' },
  { key: 'tortuga', label: 'Tortuga', emoji: '🐢' },
  { key: 'otro', label: 'Otro', emoji: '🐾' },
])

/** The kinds of home, in the order the form offers them. Voice pass pending. */
export const HOMES = /** @type {{ key: Home, label: string }[]} */ ([
  { key: 'departamento', label: 'Departamento' },
  { key: 'casa', label: 'Casa' },
  { key: 'casa_con_parque', label: 'Casa con parque' },
])
/**
 * @typedef {{ field: string, label: string, value: string, aside?: string, flag?: string }} FamilyRow
 * `field` is where the form opens for this row; `flag` is the key the review
 * card flags it by, when that isn't `field` (every interests row is 'interests').
 */

/**
 * An age in months in words: `8 meses`, `2 años`, `1 año y 10 meses`.
 * @param {number} ageMonths
 * @param {{ alwaysMonths?: boolean }} [options] `alwaysMonths` says `y 0 meses`
 *   too, so a parent who gave only the years sees what the app took and fixes it
 */
export function ageText(ageMonths, { alwaysMonths = false } = {}) {
  const years = Math.floor(ageMonths / 12)
  const months = ageMonths % 12
  const monthsText = months === 1 ? '1 mes' : `${months} meses`
  if (years === 0) return monthsText
  const yearsText = years === 1 ? '1 año' : `${years} años`
  return months === 0 && !alwaysMonths ? yearsText : `${yearsText} y ${monthsText}`
}

/** The Home header line: the kids only. The pet turns up in ideas and stories. @param {Family} family */
export function familyLine(family) {
  return family.kids.map((kid) => (kid.ageMonths == null ? kid.name : `${kid.name}, ${ageText(kid.ageMonths)}`)).join(' · ')
}

const SPANISH_LIST = new Intl.ListFormat('es', { type: 'conjunction' })

/**
 * Who's playing on this device, by name, joined in Spanish: "Milán",
 * "Milán y Sofi", "Tomás, Emma y Milán", with "e" before an "i" sound
 * ("Milán e Inés"). Names stay exactly as written; empty with no kids.
 * @param {Family | null | undefined} family
 */
export function playingNames(family) {
  const kids = family?.kids ?? []
  return SPANISH_LIST.format(kids.filter((kid) => kid.playing !== false).map((kid) => kid.name))
}

/**
 * What the kids playing on this device love (JUG-144), each once, in the
 * order the kids and their interests come. Two kids who both love "los
 * dinosaurios" give it once, as the first of them spelled it.
 * @param {Family | null | undefined} family
 */
export function playingInterests(family) {
  /** @type {Map<string, string>} */
  const seen = new Map()
  for (const kid of family?.kids ?? []) {
    if (kid.playing === false) continue
    for (const interest of kid.interests ?? []) {
      const key = interest.trim().toLocaleLowerCase('es')
      if (!seen.has(key)) seen.set(key, interest)
    }
  }
  return [...seen.values()]
}

/**
 * The age, in months, of the youngest kid playing on this device whose age
 * the family gave. It is the age a story is written for, so it is the age the
 * story's waiting animation follows too (JUG-132). Null when no kid playing
 * has a known age.
 * @param {Family | null | undefined} family
 */
export function playingAgeMonths(family) {
  const ages = (family?.kids ?? [])
    .filter((kid) => kid.playing !== false && kid.ageMonths != null)
    .map((kid) => /** @type {number} */ (kid.ageMonths))
  return ages.length === 0 ? null : Math.min(...ages)
}

/** The same interests, in any order and case. @param {string[]} a @param {string[]} b */
function sameInterests(a, b) {
  const key = (/** @type {string[]} */ list) => list.map((item) => item.trim().toLocaleLowerCase('es')).sort().join('\n')
  return key(a) === key(b)
}

/** The interests as one line that reads as a sentence: joined, with a capital. @param {string[]} interests */
function interestsLine(interests) {
  const line = interests.join(' · ')
  return line[0].toUpperCase() + line.slice(1)
}

/**
 * The family card's rows in a fixed order: each parent, each kid, the pet,
 * what they love, the home, and the toys when `toys` asks for them. Names are
 * joined exactly as typed; only the interests lines are capitalised, because
 * they read as sentences.
 *
 * What they love goes kid by kid (JUG-144). When every kid loves the same
 * things, as when the parent's text didn't say whose each one was, it is one
 * row for all of them.
 *
 * Mi familia leaves the toys out, since the toy box is where they live
 * (JUG-21). Onboarding's card shows them, because confirming it saves them.
 * @param {Family} family
 * @param {{ toys?: boolean }} [options]
 * @returns {FamilyRow[]}
 */
export function familyRows(family, { toys = false } = {}) {
  /** @type {FamilyRow[]} */
  const rows = family.parents.map((parent, index) => ({
    field: `parents.${index}`,
    flag: 'parents',
    // Voice pass pending.
    label: 'Padres',
    value: `${parent.name} · le dicen ${parent.calledAs}`,
  }))
  family.kids.forEach((kid, index) =>
    rows.push(
      kid.ageMonths == null
        ? { field: `kids.${index}`, label: 'Chicos', value: kid.name, aside: '· sin edad' }
        : { field: `kids.${index}`, label: 'Chicos', value: `${kid.name} · ${ageText(kid.ageMonths, { alwaysMonths: true })}` },
    ),
  )
  if (family.pet) rows.push({ field: 'pet', label: 'Mascota', value: petText(family.pet, family.petKind) })

  const [first, ...others] = family.kids
  const shared = first && first.interests.length > 0 && others.every((kid) => sameInterests(kid.interests, first.interests))
  if (shared) {
    rows.push({ field: 'interests.0', flag: 'interests', label: others.length > 0 ? 'Les encanta' : 'Le encanta', value: interestsLine(first.interests) })
  } else {
    family.kids.forEach((kid, index) => {
      if (kid.interests.length === 0) return
      rows.push({ field: `interests.${index}`, flag: 'interests', label: `A ${kid.name} le encanta`, value: interestsLine(kid.interests) })
    })
  }

  const home = HOMES.find((each) => each.key === family.home)
  // Voice pass pending.
  if (home) rows.push({ field: 'home', label: 'Mi casa', value: home.label })

  // Voice pass pending.
  if (family.location) {
    rows.push({
      field: 'location',
      label: 'Dónde vivimos',
      value: family.location.name,
      // Colour is never the only signal, and this isn't an error either: a
      // place Ludi couldn't find simply means no weather (JUG-25).
      ...(family.location.located ? {} : { aside: '· no lo encontré' }),
    })
  }

  if (toys && family.toys.length > 0) rows.push({ field: 'toys', label: 'Juguetes', value: family.toys.map((toy) => toy.name).join(' · ') })
  return rows
}

/** The pet and its animal, "Inca · perro", or the name alone for another animal. @param {string} name @param {PetKind} kind */
function petText(name, kind) {
  const label = kind === 'otro' ? null : PET_KINDS.find((each) => each.key === kind)?.label
  return label ? `${name} · ${label.toLocaleLowerCase('es')}` : name
}

/**
 * @param {Family | null | undefined} family
 * @param {{ toys?: boolean }} [options] whether the form shows the toys, which only onboarding does
 * @returns {FormState}
 */
export function toForm(family, { toys = false } = {}) {
  const parents = family?.parents.map((parent) => ({ ...parent })) ?? []
  const kids =
    family?.kids.map((kid) => ({
      id: kid.id,
      name: kid.name,
      years: kid.ageMonths == null ? '' : String(Math.floor(kid.ageMonths / 12)),
      months: kid.ageMonths == null ? '' : String(kid.ageMonths % 12),
      interests: [...(kid.interests ?? [])],
    })) ?? []
  return {
    parents: parents.length > 0 ? parents : [blankParent()],
    kids: kids.length > 0 ? kids : [{ name: '', years: '', months: '', interests: [] }],
    pet: family?.pet ?? '',
    petKind: family?.petKind ?? DEFAULT_PET_KIND,
    home: family?.home ?? null,
    location: family?.location?.name ?? null,
    toys: toys ? (family?.toys.length ? family.toys : [{ name: '' }]) : null,
  }
}

/** A parent card with nothing written in it yet, which says "Mamá" until changed. @returns {Parent} */
export const blankParent = () => ({ name: '', calledAs: DEFAULT_CALLED_AS })

/**
 * A name as it sounds, only to tell whether the parent is talking about
 * someone or something the form already has: no case, accents, or extra
 * spaces. What is saved is always the name as typed.
 * @param {string} name
 */
const heard = (name) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** A row the parent hasn't written anything in, which a voice note fills instead of pushing down. */
const blankKid = (/** @type {FormState['kids'][number]} */ kid) =>
  !kid.name.trim() && !kid.years && !kid.months && kid.interests.length === 0

/**
 * What the parent just said about the family, folded into the form they have
 * open (JUG-103). A note on the edit form says what changed, so nothing is
 * taken away by being left out of it: a kid already on the form keeps their
 * place, their id, and the spelling the family gave them, and takes the age
 * and whatever new they love; a name the form doesn't have yet is added at
 * the end, and so are toys it doesn't have, when the form shows toys. A
 * parent already on the form takes what the kids call them only when the
 * note says it, and a new one is added. The pet changes only when the note
 * names one, and its animal when the note says it or the pet is a new one.
 *
 * Names are matched as they sound, so "milan" is the Milán already there.
 * Nothing is saved here either: the form is what the parent checks, and
 * "Guardar" is what saves it.
 * @param {FormState} form
 * @param {HeardFamily} said what the API read in the parent's words
 * @returns {FormState}
 */
export function withChanges(form, said) {
  const parents = form.parents.filter((parent) => parent.name.trim())
  const kids = form.kids.filter((kid) => !blankKid(kid))

  for (const parent of said.parents) {
    const at = parents.findIndex((each) => heard(each.name) === heard(parent.name))
    if (at < 0) parents.push({ name: parent.name, calledAs: parent.calledAs ?? DEFAULT_CALLED_AS })
    else if (parent.calledAs) parents[at] = { ...parents[at], calledAs: parent.calledAs }
  }

  for (const kid of said.kids) {
    const years = kid.ageMonths == null ? null : String(Math.floor(kid.ageMonths / 12))
    const months = kid.ageMonths == null ? null : String(kid.ageMonths % 12)
    const at = kids.findIndex((each) => heard(each.name) === heard(kid.name))
    if (at < 0) {
      kids.push({ name: kid.name, years: years ?? '', months: months ?? '', interests: [...kid.interests] })
      continue
    }
    const known = kids[at]
    kids[at] = {
      ...known,
      years: years ?? known.years,
      months: months ?? known.months,
      interests: [
        ...known.interests,
        ...kid.interests.filter((one) => !known.interests.some((each) => heard(each) === heard(one))),
      ],
    }
  }

  let toys = form.toys
  if (toys) {
    toys = toys.filter((toy) => toy.name.trim())
    for (const toy of said.toys) {
      if (!toys.some((each) => heard(each.name) === heard(toy.name))) toys.push({ name: toy.name })
    }
    if (toys.length === 0) toys = [{ name: '' }]
  }

  const samePet = !said.pet || heard(said.pet) === heard(form.pet)
  return {
    parents: parents.length > 0 ? parents : [blankParent()],
    kids: kids.length > 0 ? kids : toForm(null).kids,
    pet: said.pet || form.pet,
    petKind: said.petKind ?? (samePet ? form.petKind : DEFAULT_PET_KIND),
    home: form.home,
    location: form.location,
    toys,
  }
}

/**
 * Drops what was left empty; never touches how a name is spelled. An age with
 * only the years is that many years and no months; one left blank is unknown.
 * A parent with no name is left out, and one whose "le dicen" was cleared is
 * "Mamá" again. Toys the form doesn't show are left out too, so saving keeps
 * the ones the toy box has.
 * @param {FormState} form
 * @returns {FamilyInput}
 */
export function toFamily(form) {
  return {
    parents: form.parents
      .filter((parent) => parent.name.trim())
      .map((parent) => ({ id: parent.id, name: parent.name.trim(), calledAs: parent.calledAs.trim() || DEFAULT_CALLED_AS })),
    kids: form.kids
      .filter((kid) => kid.name.trim())
      .map((kid) => ({
        id: kid.id,
        name: kid.name.trim(),
        ageMonths: kid.years || kid.months ? Number(kid.years || 0) * 12 + Number(kid.months || 0) : null,
        interests: kid.interests.map((interest) => interest.trim()).filter(Boolean),
      })),
    pet: form.pet.trim(),
    petKind: form.petKind,
    home: form.home,
    // Their own words, or nothing: the API looks up where that is (JUG-25).
    location: form.location?.trim() || null,
    // Each toy keeps its id, so the toy box keeps what it knows about it.
    ...(form.toys && { toys: form.toys.map((toy) => ({ id: toy.id, name: toy.name.trim() })).filter((toy) => toy.name) }),
  }
}

/**
 * The words that give an interest its mark (JUG-160, JUG-166), in the order
 * they are tried, so "camión de bomberos" is a truck before a car and
 * "unicornio" is a unicorn before a horse, and the specific animals come
 * before the paw print any animal gets. Matched without accents or case, at
 * the start of a word, against the family's own words, a story's title and
 * teaser, a series' storyline, or a toy's names and what it is.
 * @type {[import('../../shared/ui/Icons').Mark, RegExp][]}
 */
const MARK_WORDS = [
  ['dinosaur', /\b(dino|tiranosaurio|t-?rex|velociraptor|triceratops|brontosaurio|braquiosaurio)/],
  ['dragon', /\bdragon/],
  ['unicorn', /\bunicornio/],
  ['truck', /\b(camion|volquete|bomberos)/],
  ['tractor', /\b(tractor|excavadora|topadora|grua|maquinas de obra)/],
  ['car', /\b(autos?\b|autito|coche|carrito|carros?\b|camioneta|carrera|formula 1)/],
  ['train', /\b(tren\b|trenes|trencito|locomotora)/],
  ['plane', /\b(avion|aeropuerto)/],
  ['rocket', /\b(cohete|astronauta|espacio\b|planeta|nave espacial)/],
  ['boat', /\b(barco|pirata|velero|botes?\b|lancha)/],
  ['robot', /\brobot/],
  ['blocks', /\b(bloques|lego|rasti|encastre)/],
  ['whale', /\b(ballena|delfin|orca\b|orcas)/],
  ['fish', /\b(pez\b|peces|pecera|pescar|tiburon)/],
  ['waves', /\b(mar\b|playa|pileta|nadar|sirena|olas?\b|agua\b)/],
  ['bow', /\b(muneca|munequita|barbie|princesa|hada)/],
  ['notes', /\b(musica|cancion|canciones|cantar|bailar|baile|instrumento|guitarra|tambor|piano)/],
  ['ball', /\b(futbol|pelota|gol\b|goles|basquet)/],
  ['dog', /\b(perr|cachorr)/],
  ['cat', /\bgat(o|a|i)/],
  ['horse', /\b(caball|pony|poni\b|ponis)/],
  ['rabbit', /\bconej/],
  ['butterfly', /\b(mariposa|bicho|insecto|vaquitas? de san antonio)/],
  ['cow', /\b(vacas?\b|vaquita\b|toros?\b|granja)/],
  ['lion', /\b(leon\b|leonas?\b|leones|leoncit)/],
  ['bear', /\b(osos?\b|osito|osita|peluche)/],
  ['elephant', /\belefant/],
  ['bird', /\b(pajar|ave\b|aves\b|pollit|gallina|pato\b|patos|patito|loro|buho|lechuza|pinguino)/],
  ['paw', /\b(animal|mascota|zoologico)/],
]

/**
 * The mark for the first of `texts` that names a common interest, or null
 * (JUG-160). Most interests have none, and that is fine: the mark is a small
 * extra, never a category.
 * @param {...(string | null | undefined)} texts
 * @returns {import('../../shared/ui/Icons').Mark | null}
 */
export function interestMark(...texts) {
  for (const text of texts) {
    if (!text) continue
    const plain = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es')
    const found = MARK_WORDS.find(([, words]) => words.test(plain))
    if (found) return found[0]
  }
  return null
}

/**
 * The mark of someone in a story, by the words the story calls them (JUG-170):
 * the family's pet by its animal, so Inca gets the dog, and anyone else by
 * what their words name, so "el tren grandote" gets the train. Null for most.
 * @param {string} who
 * @param {Family | null | undefined} family
 * @returns {import('../../shared/ui/Icons').Mark | null}
 */
export function characterMark(who, family) {
  const plain = (/** @type {string} */ text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim()
  const pet = family?.pet ? plain(family.pet) : ''
  if (pet && plain(who).includes(pet)) {
    const animal = PET_KINDS.find((each) => each.key === family?.petKind && each.key !== 'otro')
    const mark = animal ? interestMark(animal.label) : null
    if (mark) return mark
  }
  return interestMark(who)
}
