import { errorBody, LONG_TEXT, text, uuid } from '../http/schemas.js'
import { REQUEST_LIMITS } from './requests.js'

/** @typedef {ReturnType<typeof import('./stories.controller.js').createStoriesController>} StoriesController */

// Every route here needs a session and a family, so 401 and 409 are always
// possible; a route that names a story can answer that there is no such story.
const errors = { 400: errorBody, 401: errorBody, 409: errorBody, 500: errorBody }
const storyErrors = { ...errors, 404: errorBody }
// Writing a story from a keyword or a request, and every series, needs the
// LLM, so these routes can also say it is off.
const writeErrors = { ...storyErrors, 503: errorBody }

/** As long as an interest the family profile lets a parent type. */
const KEYWORD_MAX = 80

// The series a story is an episode of (JUG-59), which is how the reading
// screen knows to say so. Null on a story that stands on its own.
const storySeries = {
  type: ['object', 'null'],
  required: ['id', 'title', 'episode'],
  properties: { id: { type: 'string' }, title: { type: 'string' }, episode: { type: 'integer' } },
}

// A sound the parent acts out, as the legend over the story shows it (JUG-170).
const sound = {
  type: 'object',
  required: ['sound', 'who', 'how'],
  properties: { sound: { type: 'string' }, who: { type: 'string' }, how: { type: 'string' } },
}

const story = {
  type: 'object',
  required: ['id', 'templateId', 'plotId', 'keyword', 'series', 'title', 'teaser', 'minutes', 'parts', 'sounds'],
  properties: {
    id: { type: 'string' },
    templateId: { type: ['string', 'null'] },
    plotId: { type: ['string', 'null'] },
    keyword: { type: ['string', 'null'] },
    series: storySeries,
    title: { type: 'string' },
    teaser: { type: 'string' },
    minutes: { type: 'integer' },
    parts: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
    sounds: { type: 'array', items: sound },
  },
}

// One series with its episodes in order, which is how the web both lists them
// and opens one.
const series = {
  type: 'object',
  required: ['id', 'title', 'storyline', 'episodes', 'maxEpisodes', 'createdAt'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    storyline: { type: 'string' },
    episodes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'minutes', 'episode', 'createdAt'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          minutes: { type: 'integer' },
          episode: { type: 'integer' },
          createdAt: { type: 'string' },
        },
      },
    },
    // How many episodes this series holds in all, so the web can say when it is full.
    maxEpisodes: { type: 'integer' },
    createdAt: { type: 'string' },
  },
}

const seriesList = { type: 'object', required: ['series'], properties: { series: { type: 'array', items: series } } }

const savedStory = {
  type: 'object',
  required: ['id', 'title', 'teaser', 'minutes', 'createdAt'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    teaser: { type: 'string' },
    minutes: { type: 'integer' },
    createdAt: { type: 'string' },
  },
}

const optionsQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // The options already on screen, for "Otras opciones".
    exclude: { type: 'array', maxItems: 20, items: uuid },
  },
}

const idParams = { type: 'object', required: ['id'], properties: { id: uuid } }

const writeBody = {
  type: 'object',
  additionalProperties: false,
  required: ['templateId'],
  properties: { templateId: uuid },
}

// The story a parent asked for in a voice note (JUG-156): what the API read
// from their words, sent back once they said yes to it.
const storyRequest = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'family', 'characters', 'setting', 'theme', 'plot'],
  properties: {
    summary: { type: 'string', maxLength: REQUEST_LIMITS.summary },
    family: { type: 'array', maxItems: REQUEST_LIMITS.names, items: text(REQUEST_LIMITS.name) },
    characters: { type: 'array', maxItems: REQUEST_LIMITS.characters, items: text(REQUEST_LIMITS.character) },
    setting: { type: ['string', 'null'], maxLength: REQUEST_LIMITS.line },
    theme: { type: ['string', 'null'], maxLength: REQUEST_LIMITS.line },
    plot: { type: ['string', 'null'], maxLength: REQUEST_LIMITS.plot },
  },
}

// The words of a voice note asking for a story, as long as a note about the toys.
const understandingInput = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: { text: text(LONG_TEXT) },
}

// A story to read: one the family was offered, by its id, an interest they
// tapped, by its own words (JUG-140), or the story they asked for (JUG-156).
// Exactly one of the three.
const streamBody = {
  type: 'object',
  additionalProperties: false,
  properties: { id: uuid, keyword: text(KEYWORD_MAX), request: storyRequest },
  oneOf: [{ required: ['id'] }, { required: ['keyword'] }, { required: ['request'] }],
}

/**
 * Stories for an adult who has already saved a family. The two streams have
 * no schema for their 200: they hijack the reply and send server-sent
 * events, described by the service's `OptionEvent` and `StoryEvent`. What
 * they can refuse with before the stream starts is a regular response, so
 * they declare those statuses.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ controller: StoriesController }} options
 */
export async function storiesRoutes(app, { controller }) {
  const config = { access: 'family' }
  app.get('/stories/options', { config, schema: { querystring: optionsQuery, response: errors } }, controller.options)
  app.post(
    '/stories',
    { config, schema: { body: writeBody, response: { 200: story, ...storyErrors } } },
    controller.write,
  )
  app.post('/stories/write', { config, schema: { body: streamBody, response: writeErrors } }, controller.writeStream)
  // What story a voice note asks for (JUG-156). Only the model reads it, so it can say it is off.
  app.post(
    '/stories/understanding',
    { config, schema: { body: understandingInput, response: { 200: storyRequest, ...errors, 503: errorBody } } },
    controller.understand,
  )
  app.get(
    '/stories',
    { config, schema: { response: { 200: { type: 'array', items: savedStory }, ...errors } } },
    controller.list,
  )
  app.get('/stories/:id', { config, schema: { params: idParams, response: { 200: story, ...storyErrors } } }, controller.find)
  // The parent opened a story to read it (JUG-188), for the family's history.
  app.post('/stories/:id/reads', { config, schema: { params: idParams, response: storyErrors } }, controller.markRead)

  // Series (JUG-59). Starting one and writing an episode both need the LLM,
  // so both can say the feature is off; a series that is already as long as it
  // gets answers 409, like a story the family profile can't fill.
  app.post(
    '/stories/:id/series',
    { config, schema: { params: idParams, response: { 201: series, ...writeErrors } } },
    controller.makeSeries,
  )
  app.get('/series', { config, schema: { response: { 200: seriesList, ...errors } } }, controller.listSeries)
  app.get('/series/:id', { config, schema: { params: idParams, response: { 200: series, ...storyErrors } } }, controller.findSeries)
  app.delete('/series/:id', { config, schema: { params: idParams, response: storyErrors } }, controller.removeSeries)
  app.post('/series/:id/episodes', { config, schema: { params: idParams, response: writeErrors } }, controller.writeEpisode)
}