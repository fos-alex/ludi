import { errorBody, LONG_TEXT, text, uuid as id } from '../http/schemas.js'
import { HOMES, PET_KINDS } from './kinds.js'

/** @typedef {ReturnType<typeof import('./families.controller.js').createFamiliesController>} FamiliesController */

// What every route here can refuse with: bad input, no session, or our own fault.
const errors = { 400: errorBody, 401: errorBody, 500: errorBody }

const named = {
  type: 'object',
  required: ['id', 'name'],
  properties: { id: { type: 'string' }, name: { type: 'string' } },
}

const words = { type: 'array', items: { type: 'string' } }

// What animal a pet is, and the kind of home, as keys (JUG-21).
const petKind = { type: 'string', enum: Object.keys(PET_KINDS) }
const home = { type: ['string', 'null'], enum: [...HOMES, null] }

// Where the family lives (JUG-25), in their own words, and whether anyone
// could put them on the map. The coordinates never leave the server.
const location = {
  type: ['object', 'null'],
  required: ['name', 'located'],
  properties: { name: { type: 'string' }, located: { type: 'boolean' } },
}

const profile = {
  type: 'object',
  required: ['id', 'name', 'home', 'location', 'parents', 'kids', 'pets', 'toys'],
  properties: {
    id: { type: 'string' },
    name: { type: ['string', 'null'] },
    home,
    location,
    parents: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'calledAs'],
        properties: { id: { type: 'string' }, name: { type: 'string' }, calledAs: { type: 'string' } },
      },
    },
    kids: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'ageMonths', 'playing', 'interests'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          ageMonths: { type: ['integer', 'null'] },
          // Whether the kid plays with the signed-in adult (JUG-107).
          playing: { type: 'boolean' },
          // What this kid loves (JUG-144).
          interests: words,
        },
      },
    },
    pets: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'kind'],
        properties: { id: { type: 'string' }, name: { type: 'string' }, kind: { type: 'string' } },
      },
    },
    toys: { type: 'array', items: named },
  },
}

// The whole profile, as the parent last saw it. Items that carry the id of an
// existing row update it; the rest are new. The home, the parents, and the
// toys stay as they are when left out: the family form no longer shows the
// toys, which live in the toy box (JUG-21).
const profileInput = {
  type: 'object',
  additionalProperties: false,
  required: ['kids', 'pets'],
  properties: {
    name: { type: ['string', 'null'], maxLength: 80 },
    home,
    // A city or a zone, in the parent's own words (JUG-25). Left out, it
    // stays as it was, like the home and the toys.
    location: { type: ['string', 'null'], maxLength: 120 },
    parents: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        // What the kids call them is "Mamá" when left out.
        properties: { id, name: text(80), calledAs: text(40) },
      },
    },
    kids: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'ageMonths'],
        properties: {
          id,
          name: text(80),
          // The age in months, up to 17 years and 11 months (JUG-145).
          ageMonths: { type: ['integer', 'null'], minimum: 0, maximum: 215 },
          // What this kid loves (JUG-144); a kid sent without them loves nothing yet.
          interests: { type: 'array', maxItems: 30, items: text(80) },
        },
      },
    },
    pets: {
      type: 'array',
      maxItems: 10,
      items: { type: 'object', additionalProperties: false, required: ['name'], properties: { id, name: text(80), kind: petKind } },
    },
    toys: {
      type: 'array',
      maxItems: 200,
      items: { type: 'object', additionalProperties: false, required: ['name'], properties: { id, name: text(120) } },
    },
  },
}

// The kids playing with the signed-in adult; the family's other kids sit out.
const playingInput = {
  type: 'object',
  additionalProperties: false,
  required: ['kids'],
  properties: { kids: { type: 'array', minItems: 1, maxItems: 12, uniqueItems: true, items: id } },
}

// The parent's own words about their family, for the LLM to read (JUG-11).
const understandingInput = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: { text: text(LONG_TEXT) },
}

// A profile for the parent to confirm, not saved, and the fields to check.
const understanding = {
  type: 'object',
  required: ['family', 'unsure', 'note'],
  properties: {
    family: {
      type: 'object',
      required: ['parents', 'kids', 'pets', 'toys'],
      properties: {
        parents: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'calledAs'],
            properties: { name: { type: 'string' }, calledAs: { type: ['string', 'null'] } },
          },
        },
        kids: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'ageMonths', 'interests'],
            properties: { name: { type: 'string' }, ageMonths: { type: ['integer', 'null'] }, interests: words },
          },
        },
        pets: {
          type: 'array',
          items: { type: 'object', required: ['name', 'kind'], properties: { name: { type: 'string' }, kind: { type: ['string', 'null'] } } },
        },
        toys: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
      },
    },
    unsure: { type: 'array', items: { type: 'string' } },
    note: { type: ['string', 'null'] },
  },
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ controller: FamiliesController }} options
 */
export async function familiesRoutes(app, { controller }) {
  app.get('/family', { schema: { response: { 200: profile, ...errors, 404: errorBody } } }, controller.get)
  app.put('/family', { schema: { body: profileInput, response: { 200: profile, ...errors } } }, controller.save)
  app.put(
    '/family/playing',
    { schema: { body: playingInput, response: { 200: profile, ...errors, 404: errorBody } } },
    controller.choosePlaying,
  )
  // 503 with LLM_OFF when this server has no LLM to read the text with.
  app.post(
    '/family/understanding',
    { schema: { body: understandingInput, response: { 200: understanding, ...errors, 503: errorBody } } },
    controller.understand,
  )
}
