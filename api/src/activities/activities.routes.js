import { CATEGORIES } from '../catalog/categories.js'
import { errorBody, uuid } from '../http/schemas.js'

/** @typedef {ReturnType<typeof import('./activities.controller.js').createActivitiesController>} ActivitiesController */

const reaction = { type: ['string', 'null'], enum: ['up', 'down', null] }

// A discovery game dealt with the juego (JUG-177), or null. A round's credit
// is there only when its recording's license asks for one.
const game = {
  type: ['object', 'null'],
  required: ['type', 'set', 'rounds'],
  properties: {
    type: { type: 'string', enum: ['sounds'] },
    set: { type: 'string' },
    rounds: {
      type: 'array',
      items: {
        type: 'object',
        required: ['sound', 'options', 'answer', 'credit'],
        properties: {
          sound: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'integer' },
          credit: {
            type: ['object', 'null'],
            required: ['author', 'license', 'source'],
            properties: { author: { type: 'string' }, license: { type: 'string' }, source: { type: 'string' } },
          },
        },
      },
    },
  },
}

const activity = {
  type: 'object',
  required: ['id', 'title', 'minutes', 'place', 'why', 'needs', 'steps', 'easier', 'harder', 'game', 'materials', 'reaction'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    minutes: { type: 'integer' },
    place: { type: 'string', enum: ['indoor', 'outdoor'] },
    why: { type: 'string' },
    needs: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    easier: { type: 'string' },
    harder: { type: 'string' },
    game,
    // What the juego needs, by key (JUG-196): what the next one reuses.
    materials: { type: 'array', items: { type: 'string' } },
    reaction,
  },
}

const suggestion = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // The activity on screen, when the parent asks for another one.
    after: { type: ['string', 'null'], format: 'uuid' },
    // Con lo mismo (JUG-196): the next juego has to be playable with the
    // materials `after` needed. Without one to continue, or with nothing in
    // the catalog that continues it, the answer is 404 NO_REUSABLE_ACTIVITY.
    reuseMaterials: { type: 'boolean' },
    // The moment the juego is for (JUG-26): calm winds the kids down, lively
    // gets them moving, null asks for no preference. Left out, the server's
    // clock decides, so an old client still gets a calm juego before bed.
    mood: { type: ['string', 'null'], enum: ['calm', 'lively', null] },
    // What the parent chose the juego to be (JUG-31), each null for any: where
    // it is played, whether it plays sound on the phone, and the kind of play.
    place: { type: ['string', 'null'], enum: ['indoor', 'outdoor', null] },
    sound: { type: ['boolean', 'null'] },
    category: { type: ['string', 'null'], enum: [...CATEGORIES, null] },
  },
}

// A new juego, and whether it is only the closest to what the parent chose,
// because no juego matched all of it (JUG-31).
const suggested = {
  ...activity,
  required: [...activity.required, 'closest'],
  properties: { ...activity.properties, closest: { type: 'boolean' } },
}

// The feedback tap (JUG-23): how the juego went, or null to take it back.
const reactionInput = {
  type: 'object',
  additionalProperties: false,
  required: ['reaction'],
  properties: { reaction },
}

const reacted = {
  type: 'object',
  required: ['id', 'reaction'],
  properties: { id: { type: 'string' }, reaction },
}

const idParams = { type: 'object', required: ['id'], properties: { id: uuid } }

// The weather the next juego is picked for (JUG-191), or null when there is
// none to show. Only what the ranking reads: no temperature, no place.
const outside = {
  type: ['object', 'null'],
  required: ['weather', 'reason', 'night'],
  properties: {
    weather: { type: 'string', enum: ['fine', 'fair', 'poor'] },
    reason: { type: 'string', enum: ['clear', 'rain', 'storm', 'cold', 'heat', 'wind', 'fog', 'grey'] },
    night: { type: 'boolean' },
  },
}

/**
 * Activities for an adult who has already saved a family. 404 is the catalog
 * having nothing that fits it yet, or a juego that isn't the family's.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ controller: ActivitiesController }} options
 */
export async function activitiesRoutes(app, { controller }) {
  app.post(
    '/activities/suggestions',
    {
      config: { access: 'family' },
      schema: {
        body: suggestion,
        response: { 201: suggested, 400: errorBody, 401: errorBody, 404: errorBody, 409: errorBody, 500: errorBody },
      },
    },
    controller.suggest,
  )
  app.get(
    '/activities/weather',
    {
      config: { access: 'family' },
      schema: { response: { 200: outside, 401: errorBody, 409: errorBody, 500: errorBody } },
    },
    controller.outside,
  )
  app.put(
    '/activities/:id/reaction',
    {
      config: { access: 'family' },
      schema: {
        params: idParams,
        body: reactionInput,
        response: { 200: reacted, 400: errorBody, 401: errorBody, 404: errorBody, 409: errorBody, 500: errorBody },
      },
    },
    controller.react,
  )
  // One juego as the parent saw it, to play it again from the history (JUG-188).
  app.get(
    '/activities/:id',
    {
      config: { access: 'family' },
      schema: {
        params: idParams,
        response: { 200: activity, 400: errorBody, 401: errorBody, 404: errorBody, 409: errorBody, 500: errorBody },
      },
    },
    controller.find,
  )
  // The parent tapped Empezar (JUG-188): when, and nothing else.
  app.post(
    '/activities/:id/plays',
    {
      config: { access: 'family' },
      schema: {
        params: idParams,
        response: { 400: errorBody, 401: errorBody, 404: errorBody, 409: errorBody, 500: errorBody },
      },
    },
    controller.play,
  )
}
