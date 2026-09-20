/**
 * Families: the adults who belong to them, and the profile everything is
 * tailored to (the parents, kids and what each one loves, pets, toys, and the
 * home). Each adult has one family for now; the second parent joins in 0.6.
 */
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { families, familyMembers, kidInterests, kids, kidsSittingOut, parents, pets } from './families.schema.js'
import { DEFAULT_CALLED_AS, DEFAULT_PET_KIND } from './kinds.js'
import { toys } from '../toys/toys.schema.js'
import { NotFoundError, ValidationError } from '../errors.js'

/** @typedef {{ id: string, name: string | null }} Family */
/**
 * @typedef {{ id: string, name: string, ageMonths: number | null, playing: boolean, interests: string[] }} Kid
 * `ageMonths` is the kid's age today, in months (JUG-145). `playing` is for the
 * adult asking (JUG-107); with no adult named, every kid plays. `interests` are
 * this kid's own (JUG-144), as the parent typed them.
 */
/** @typedef {{ id: string, name: string, kind: string }} Pet `kind` is a key from PET_KINDS (JUG-21). */
/** @typedef {{ id: string, name: string, calledAs: string }} Parent A parent's name, and what the kids call them (JUG-21). */
/** @typedef {{ id: string, name: string, favorite: boolean }} ProfileToy A toy by its family name, and whether it is a favorite (JUG-104). */
/**
 * @typedef {{ name: string, located: boolean }} FamilyLocation
 * Where the family lives (JUG-25), in their own words, and whether anyone
 * could put those words on the map. The coordinates stay on the server: only
 * the weather reads them, and nothing serves them.
 */
/**
 * @typedef {{
 *   id: string, name: string | null, home: string | null, location: FamilyLocation | null,
 *   parents: Parent[], kids: Kid[], pets: Pet[], interests: string[], toys: ProfileToy[],
 * }} Profile
 * `interests` are those of the kids in the profile, each once: the whole
 * family's in `profileOf`, and only the kids playing in `playingProfile`.
 * `home` is a key from HOMES, or null until the family says, and `location`
 * is null until they say where they live.
 */
/**
 * @typedef {object} ProfileInput The whole profile, in order. Items that carry
 *   the id of one of the family's rows update it; the rest are new. What is
 *   left out (the name, the home, where they live, the parents, the toys) stays as it was.
 * @property {string | null} [name]
 * @property {string | null} [home]
 * @property {string | null} [location] where they live, in their own words; the geocoder
 *   is asked where that is only when these words changed
 * @property {{ id?: string, name: string, calledAs?: string }[]} [parents] a parent sent without `calledAs` is "Mamá"
 * @property {{ id?: string, name: string, ageMonths: number | null, interests?: string[] }[]} kids
 * @property {{ id?: string, name: string, kind?: string }[]} pets a new pet sent without `kind` is a dog
 * @property {{ id?: string, name: string }[]} [toys] the toy box's own screens edit them too (JUG-21)
 */
/** @typedef {import('../places/geocoder.js').Geocoder} Geocoder */
/** @typedef {import('../places/geocoder.js').Place} Place */
/** @typedef {import('../db/client.js').Db} Db */
/** @typedef {import('../db/client.js').Tx} Tx */
/** @typedef {ReturnType<typeof createFamiliesService>} FamiliesService */

/**
 * A kid's age today, in months: the age the parent gave, plus the whole months
 * since they gave it.
 * @param {{ ageMonths: import('drizzle-orm').Column, ageSetOn: import('drizzle-orm').Column }} kid
 */
const currentAge = (kid) => {
  const since = sql`age(current_date, ${kid.ageSetOn})`
  return sql`${kid.ageMonths} + (extract(year from ${since}) * 12 + extract(month from ${since}))::int`
}

/** Profile rows come back in the order the parent gave them. */
const byPosition = (
  /** @type {{ position: import('drizzle-orm').Column }} */ row,
  /** @type {{ asc: typeof import('drizzle-orm').asc }} */ { asc },
) => asc(row.position)

/** The kids a story or a juego is for, in one canonical order. @param {Pick<Profile, 'kids'>} profile */
export const kidIdsOf = (profile) => profile.kids.map((kid) => kid.id).sort()

/**
 * Everything these kids love, each once, in the order the kids and their
 * interests come. Two kids who both love "los dinosaurios" give it once, as
 * the first of them spelled it.
 * @param {Pick<Kid, 'interests'>[]} someKids
 */
export function interestsOf(someKids) {
  /** @type {Map<string, string>} */
  const seen = new Map()
  for (const kid of someKids) {
    for (const interest of kid.interests) {
      const key = interest.trim().toLocaleLowerCase('es')
      if (!seen.has(key)) seen.set(key, interest)
    }
  }
  return [...seen.values()]
}

/**
 * The profile with only these kids, and their interests, or with all of them
 * when none of these is in the family any more.
 * @param {Profile} profile
 * @param {string[]} kidIds
 * @returns {Profile}
 */
export function withKids(profile, kidIds) {
  const chosen = profile.kids.filter((kid) => kidIds.includes(kid.id))
  const kept = chosen.length > 0 ? chosen : profile.kids
  return { ...profile, kids: kept, interests: interestsOf(kept) }
}

/**
 * @param {{
 *   db: Db,
 *   geocoder?: Geocoder | null,
 *   usage?: import('../usage/usage.service.js').UsageService | null,
 * }} deps `geocoder` puts the family's words for where they live on the map
 *   (JUG-25); without one the words are still saved and the weather is simply
 *   never read for them. `usage` counts the families onboarded (JUG-198);
 *   absent, nothing is counted.
 */
export function createFamiliesService({ db, geocoder = null, usage = null }) {
  /**
   * @param {string} familyId
   * @param {string | null} [userId] the adult asking, whose kids sitting out come back not playing
   * @returns {Promise<Profile>}
   */
  async function profileOf(familyId, userId = null) {
    const family = await db.query.families.findFirst({
      columns: { id: true, name: true, home: true, location: true, latitude: true },
      where: eq(families.id, familyId),
      with: {
        parents: { columns: { id: true, name: true, calledAs: true }, orderBy: byPosition },
        kids: {
          columns: { id: true, name: true },
          extras: (kid) => ({ ageMonths: currentAge(kid).mapWith(Number).as('age_months') }),
          orderBy: byPosition,
          with: { interests: { columns: { label: true }, orderBy: byPosition } },
        },
        pets: { columns: { id: true, name: true, kind: true }, orderBy: byPosition },
        toys: { columns: { id: true, name: true, favorite: true }, orderBy: byPosition },
      },
    })
    if (!family) throw new NotFoundError('No such family')
    const { location, latitude, ...rest } = family
    const out = new Set()
    if (userId) {
      const rows = await db.select({ kidId: kidsSittingOut.kidId }).from(kidsSittingOut).where(eq(kidsSittingOut.userId, userId))
      for (const row of rows) out.add(row.kidId)
    }
    // At least one kid always plays: when the one left playing was removed, everyone plays again.
    const nobodyPlays = family.kids.every((kid) => out.has(kid.id))
    const familyKids = family.kids.map((kid) => ({
      id: kid.id,
      name: kid.name,
      ageMonths: kid.ageMonths,
      playing: nobodyPlays || !out.has(kid.id),
      interests: kid.interests.map((row) => row.label),
    }))
    return {
      ...rest,
      location: location === null ? null : { name: location, located: latitude !== null },
      kids: familyKids,
      interests: interestsOf(familyKids),
    }
  }

  /**
   * What to write for where the family lives, or null to leave the row alone.
   * The geocoder is asked only when the parent changed the words, so saving
   * the family again asks nobody. Words nobody can place are still saved,
   * with no coordinates: they are the family's own, and the weather is simply
   * not read for them. A geocoder that fails is the same as one that found
   * nothing, since a family must always be able to save.
   * @param {string} userId
   * @param {string | null} location
   * @returns {Promise<{ location: string | null, latitude: number | null, longitude: number | null } | null>}
   */
  async function locatedFor(userId, location) {
    const name = location?.trim().replace(/\s+/g, ' ') || null
    const familyId = await familyIdOf(db, userId)
    if (familyId) {
      const [row] = await db.select({ location: families.location }).from(families).where(eq(families.id, familyId))
      if (row && row.location === name) return null
    }
    if (!name) return { location: null, latitude: null, longitude: null }
    // Never logged and never in an error: the words are the family's own.
    const place = await geocoder?.locate(name).catch(() => null)
    return { location: name, latitude: place?.latitude ?? null, longitude: place?.longitude ?? null }
  }

  return {
    profileOf,

    /**
     * The profile as this adult plays right now: only the kids playing, and
     * only what they love.
     * @param {string} familyId
     * @param {string | null} userId
     * @returns {Promise<Profile>}
     */
    async playingProfile(familyId, userId) {
      const profile = await profileOf(familyId, userId)
      const playing = profile.kids.filter((kid) => kid.playing)
      return { ...profile, kids: playing, interests: interestsOf(playing) }
    },

    /**
     * Says which of the family's kids play with this adult, from now on and on
     * every device; the rest sit out. At least one of them must play. Ids that
     * aren't the family's kids (one removed since the screen loaded) are ignored.
     * @param {string} userId
     * @param {string[]} kidIds
     * @returns {Promise<Profile>}
     */
    async choosePlaying(userId, kidIds) {
      const familyId = await familyIdOf(db, userId)
      if (!familyId) throw new NotFoundError('No family yet')
      const familyKids = await db.select({ id: kids.id }).from(kids).where(eq(kids.familyId, familyId))
      const chosen = new Set(kidIds)
      if (!familyKids.some((kid) => chosen.has(kid.id))) {
        throw new ValidationError('At least one of the family kids plays', 'NO_KID_PLAYING')
      }
      const out = familyKids.filter((kid) => !chosen.has(kid.id))
      await db.transaction(async (tx) => {
        await tx.delete(kidsSittingOut).where(eq(kidsSittingOut.userId, userId))
        if (out.length > 0) await tx.insert(kidsSittingOut).values(out.map((kid) => ({ userId, kidId: kid.id })))
      })
      return profileOf(familyId, userId)
    },

    /**
     * Creates a family with this adult as its first member. Both rows are
     * written in one transaction, so a family never exists without a member.
     * @param {string} userId
     * @param {{ name?: string | null }} [details]
     * @returns {Promise<Family>}
     */
    async create(userId, { name = null } = {}) {
      return db.transaction((tx) => insertFamily(tx, userId, name))
    },

    /** @param {string} userId @returns {Promise<Family | null>} */
    async familyOf(userId) {
      const [family] = await db
        .select({ id: families.id, name: families.name })
        .from(families)
        .innerJoin(familyMembers, eq(familyMembers.familyId, families.id))
        .where(eq(familyMembers.userId, userId))
      return family ?? null
    },

    /** @param {string} userId @returns {Promise<string | null>} */
    idOf(userId) {
      return familyIdOf(db, userId)
    },

    /**
     * Where the family is, for the weather alone (JUG-25). Null until they
     * say where they live, and null when nobody could place their words.
     * @param {string} familyId
     * @returns {Promise<Place | null>}
     */
    async placeOf(familyId) {
      const [row] = await db
        .select({ latitude: families.latitude, longitude: families.longitude })
        .from(families)
        .where(eq(families.id, familyId))
      return row?.latitude != null && row.longitude != null ? { latitude: row.latitude, longitude: row.longitude } : null
    },

    /**
     * Saves the adult's whole family profile, starting their family if they
     * don't have one yet. All of it lands in one transaction.
     * @param {string} userId
     * @param {ProfileInput} input
     * @returns {Promise<Profile>}
     */
    async saveProfile(userId, input) {
      // Before the transaction: a geocoder that takes its time must not hold
      // the family's rows locked while it does.
      const located = input.location === undefined ? null : await locatedFor(userId, input.location)
      // Whether this save is what started the family, which is the moment
      // onboarding is finished (JUG-198). Counted after the transaction
      // commits, so a family that never saved is never counted.
      let started = false
      const familyId = await db.transaction(async (tx) => {
        // Two first saves at once must not start two families.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
        let familyId = await familyIdOf(tx, userId)
        if (!familyId) {
          familyId = (await insertFamily(tx, userId, input.name ?? null)).id
          started = true
        } else if (input.name !== undefined) await tx.update(families).set({ name: input.name }).where(eq(families.id, familyId))
        if (input.home !== undefined) await tx.update(families).set({ home: input.home }).where(eq(families.id, familyId))
        if (located) await tx.update(families).set(located).where(eq(families.id, familyId))

        if (input.parents) {
          await syncRows(tx, parents, familyId, input.parents, {
            insert: ({ name, calledAs = DEFAULT_CALLED_AS }, position) => ({ name, calledAs, position }),
            update: ({ name, calledAs = DEFAULT_CALLED_AS }, position) => ({ name, calledAs, position }),
          })
        }

        const kidIds = await syncRows(tx, kids, familyId, input.kids, {
          insert: (kid, position) => ({
            position,
            name: kid.name,
            ageMonths: kid.ageMonths,
            ageSetOn: kid.ageMonths === null ? null : sql`current_date`,
          }),
          // An age that comes back unchanged keeps counting from the day it was first given.
          update: (kid, position) => {
            const unchanged = sql`${kid.ageMonths}::smallint is not distinct from ${currentAge(kids)}`
            return {
              position,
              name: kid.name,
              ageMonths: sql`case when ${unchanged} then ${kids.ageMonths} else ${kid.ageMonths}::smallint end`,
              ageSetOn: sql`case when ${unchanged} then ${kids.ageSetOn} when ${kid.ageMonths}::smallint is null then null else current_date end`,
            }
          },
        })
        // Each kid's interests are written again as the parent last saw them.
        if (kidIds.length > 0) await tx.delete(kidInterests).where(inArray(kidInterests.kidId, kidIds))
        const rows = input.kids.flatMap((kid, index) =>
          (kid.interests ?? []).map((label, position) => ({ kidId: kidIds[index], position, label })),
        )
        if (rows.length > 0) await tx.insert(kidInterests).values(rows)
        await syncRows(tx, pets, familyId, input.pets, {
          insert: ({ name, kind = DEFAULT_PET_KIND }, position) => ({ name, kind, position }),
          // A pet sent without its kind keeps the one it has.
          update: ({ name, kind }, position) => (kind ? { name, kind, position } : { name, position }),
        })
        if (input.toys) await syncRows(tx, toys, familyId, input.toys, nameOnly)
        return familyId
      })
      if (started) await usage?.record('family_created', { familyId, userId })
      return profileOf(familyId, userId)
    },
  }
}

/** @param {Db | Tx} db @param {string} userId @returns {Promise<string | null>} */
async function familyIdOf(db, userId) {
  const [member] = await db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(eq(familyMembers.userId, userId))
  return member?.familyId ?? null
}

/** @param {Tx} tx @param {string} userId @param {string | null} name @returns {Promise<Family>} */
async function insertFamily(tx, userId, name) {
  const [family] = await tx.insert(families).values({ name }).returning({ id: families.id, name: families.name })
  await tx.insert(familyMembers).values({ familyId: family.id, userId })
  return family
}

/**
 * The profile knows toys only by name, in order. Updating a toy leaves the
 * rest of what the toy box knows about it alone.
 */
const nameOnly = {
  /** @param {{ name: string }} item @param {number} position */
  insert: ({ name }, position) => ({ name, position }),
  /** @param {{ name: string }} item @param {number} position */
  update: ({ name }, position) => ({ name, position }),
}

/**
 * Makes the family's rows in `table` match `items`, in order: an item that
 * carries the id of one of the family's rows updates it, any other is
 * inserted, and the family's other rows are deleted.
 * @template {{ id?: string }} Item
 * @param {Tx} tx
 * @param {typeof kids | typeof pets | typeof parents | typeof toys} table
 * @param {string} familyId
 * @param {Item[]} items
 * @param {{ insert: (item: Item, position: number) => object, update: (item: Item, position: number) => object }} values
 * @returns {Promise<string[]>} each item's row id, in the items' order
 */
async function syncRows(tx, table, familyId, items, values) {
  /** @type {string[]} */
  const kept = []
  for (const [position, item] of items.entries()) {
    const [updated] = item.id
      ? await tx
          .update(table)
          .set(values.update(item, position))
          .where(and(eq(table.id, item.id), eq(table.familyId, familyId)))
          .returning({ id: table.id })
      : []
    const [row] = updated
      ? [updated]
      : await tx
          .insert(table)
          .values({ familyId, ...values.insert(item, position) })
          .returning({ id: table.id })
    kept.push(row.id)
  }
  await tx.delete(table).where(and(eq(table.familyId, familyId), notInArray(table.id, kept)))
  return kept
}
