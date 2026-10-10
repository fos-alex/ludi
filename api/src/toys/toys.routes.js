import { errorBody, LONG_TEXT, text, uuid as id } from '../http/schemas.js'
import { MAX_TOYS } from './toys.service.js'

/** @typedef {ReturnType<typeof import('./toys.controller.js').createToysController>} ToysController */

// Every route here needs a session and a family, so 401 and 409 are always
// possible; a route that takes input can also refuse it, and one that names a
// toy can answer that there is no such toy.
const errors = { 401: errorBody, 409: errorBody, 500: errorBody }
const inputErrors = { ...errors, 400: errorBody }
const toyErrors = { ...inputErrors, 404: errorBody }

const toy = {
  type: 'object',
  required: ['id', 'name', 'aliases', 'description', 'kidId', 'shared', 'favorite', 'linked'],
  properties: {
    id: { type: 'string' },
    // The family's own name, the only one the parent ever sees.
    name: { type: 'string' },
    aliases: { type: 'array', items: { type: 'string' } },
    // What the toy actually is, for the AI. Never shown in place of the name.
    description: { type: ['string', 'null'] },
    kidId: { type: ['string', 'null'] },
    shared: { type: 'boolean' },
    favorite: { type: 'boolean' },
    // The other toys the kid tells this one apart from, by id.
    linked: { type: 'array', items: { type: 'string' } },
  },
}

const toyList = {
  type: 'object',
  required: ['toys'],
  properties: { toys: { type: 'array', items: toy } },
}

// Names stay exactly as typed: nothing here trims, corrects, or capitalizes them.
const toyFields = {
  name: text(120),
  aliases: { type: 'array', maxItems: 20, uniqueItems: true, items: text(120) },
  description: { type: ['string', 'null'], minLength: 1, maxLength: 500 },
  kidId: { type: ['string', 'null'], format: 'uuid' },
  shared: { type: 'boolean' },
  favorite: { type: 'boolean' },
}

const newToy = { type: 'object', additionalProperties: false, required: ['name'], properties: toyFields }
const toyChanges = { type: 'object', additionalProperties: false, minProperties: 1, properties: toyFields }
const toyParams = { type: 'object', required: ['id'], properties: { id } }

const linksInput = {
  type: 'object',
  additionalProperties: false,
  required: ['toys'],
  properties: { toys: { type: 'array', maxItems: MAX_TOYS, uniqueItems: true, items: id } },
}

const toysUnderstandingInput = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: { text: text(LONG_TEXT) },
}

const toysUnderstanding = {
  type: 'object',
  required: ['toys'],
  properties: {
    toys: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'description'],
        properties: { name: { type: 'string' }, description: { type: ['string', 'null'] } },
      },
    },
  },
}

/**
 * The toy box, for an adult who has already saved a family.
 * @param {import('fastify').FastifyInstance} app
 * @param {{ controller: ToysController }} options
 */
export async function toysRoutes(app, { controller }) {
  const config = { access: 'family' }
  app.get('/family/toys', { config, schema: { response: { 200: toyList, ...errors } } }, controller.list)
  app.post('/family/toys', { config, schema: { body: newToy, response: { 201: toy, ...inputErrors } } }, controller.add)
  app.patch(
    '/family/toys/:id',
    { config, schema: { params: toyParams, body: toyChanges, response: { 200: toy, ...toyErrors } } },
    controller.edit,
  )
  app.delete('/family/toys/:id', { config, schema: { params: toyParams, response: toyErrors } }, controller.remove)
  app.put(
    '/family/toys/:id/links',
    { config, schema: { params: toyParams, body: linksInput, response: { 200: toyList, ...toyErrors } } },
    controller.link,
  )
  // 503 with LLM_OFF when this server has no LLM to read the text with.
  app.post(
    '/family/toys/understanding',
    { config, schema: { body: toysUnderstandingInput, response: { 200: toysUnderstanding, ...inputErrors, 503: errorBody } } },
    controller.understand,
  )
}
