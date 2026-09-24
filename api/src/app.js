import { DrizzleQueryError } from 'drizzle-orm'
import Fastify from 'fastify'
import { createAccountsController } from './accounts/accounts.controller.js'
import { accountsRoutes, adminAccountsRoutes } from './accounts/accounts.routes.js'
import { createAccountsService } from './accounts/accounts.service.js'
import { createActivitiesController } from './activities/activities.controller.js'
import { activitiesRoutes } from './activities/activities.routes.js'
import { createActivitiesService } from './activities/activities.service.js'
import { createEnjoyment } from './activities/enjoyment.js'
import { createAuditService } from './audit/audit.service.js'
import { createAuth } from './auth/auth.js'
import { authRoutes } from './auth/auth.routes.js'
import { createRequireSession } from './auth/session.js'
import { createCatalogController } from './catalog/catalog.controller.js'
import { catalogRoutes } from './catalog/catalog.routes.js'
import { createCatalogService } from './catalog/catalog.service.js'
import { createFamiliesController } from './families/families.controller.js'
import { familiesRoutes } from './families/families.routes.js'
import { createFamiliesService } from './families/families.service.js'
import { createRequireFamily } from './families/require-family.js'
import { createUnderstanding } from './families/understanding.js'
import { createGamesController } from './games/games.controller.js'
import { gamesRoutes } from './games/games.routes.js'
import { createGamesService } from './games/games.service.js'
import { createHistoryController } from './history/history.controller.js'
import { historyRoutes } from './history/history.routes.js'
import { createHistoryService } from './history/history.service.js'
import { createMailer } from './email/mailer.js'
import { AppError, UnavailableError } from './errors.js'
import { createJev } from './jev/typesafe.js'
import { createLlm } from './llm/client.js'
import { createHealthController } from './health/health.controller.js'
import { healthRoutes } from './health/health.routes.js'
import { createInvitationsController } from './invitations/invitations.controller.js'
import { adminUsersRoutes, invitationsRoutes } from './invitations/invitations.routes.js'
import { createInvitationsService } from './invitations/invitations.service.js'
import { createMaterialsController } from './materials/materials.controller.js'
import { materialsRoutes } from './materials/materials.routes.js'
import { createMaterialsService } from './materials/materials.service.js'
import { createGeocoder } from './places/geocoder.js'
import { createStoriesController } from './stories/stories.controller.js'
import { storiesRoutes } from './stories/stories.routes.js'
import { createStoriesService } from './stories/stories.service.js'
import { createToysController } from './toys/toys.controller.js'
import { toysRoutes } from './toys/toys.routes.js'
import { createToysService } from './toys/toys.service.js'
import { createToysUnderstanding } from './toys/understanding.js'
import { createTranscriber } from './voice/transcriber.js'
import { createVoiceController } from './voice/voice.controller.js'
import { voiceRoutes } from './voice/voice.routes.js'
import { createVoiceService } from './voice/voice.service.js'
import { createForecaster } from './weather/open-meteo.js'
import { createWeatherService } from './weather/weather.service.js'

/**
 * Builds the API with every dependency wired in, here and nowhere else.
 * Routes map URLs to controllers, controllers speak HTTP, and services hold
 * the business logic and the queries. server.js runs the result; tests build
 * their own on a scratch database.
 * @param {{
 *   config: import('./config.js').Config,
 *   db: import('./db/client.js').Db,
 *   logger?: import('fastify').FastifyServerOptions['logger'],
 *   random?: () => number,
 *   now?: () => Date,
 *   llm?: ReturnType<typeof createLlm> | null,
 *   transcriber?: ReturnType<typeof createTranscriber> | null,
 *   mailer?: import('./email/mailer.js').Mailer | null,
 *   forecaster?: import('./weather/open-meteo.js').Forecaster | null,
 *   geocoder?: import('./places/geocoder.js').Geocoder | null,
 *   jev?: import('./jev/typesafe.js').Jev | null,
 * }} options `random` drives which template comes next; tests can pin it.
 * `now` picks the moment a story is written for, and when an invitation
 * expires; `llm`, `transcriber`, `mailer`, `forecaster`, `geocoder`, and
 * `jev` override the wire, so tests can speak for the model and the
 * speech-to-text service, see the email sent, and pick the weather and Jev's
 * answers rather than reach the internet. Without a key, stories come from templates; without STT_URL,
 * voice notes are off; without SMTP_HOST, nobody can be invited.
 */
export function buildApp({
  config,
  db,
  logger = true,
  random = Math.random,
  now = () => new Date(),
  llm,
  transcriber,
  mailer,
  forecaster,
  geocoder,
  jev,
}) {
  const app = Fastify({ logger })
  const accounts = createAccountsService({ db })
  // Where the family's own words for where they live are on the map (JUG-25).
  const places = geocoder === undefined ? createGeocoder({ config: config.places }) : geocoder
  const families = createFamiliesService({ db, geocoder: places })
  const toys = createToysService({ db })
  const materials = createMaterialsService({ db })
  // Every activity and story template comes from here.
  const catalog = createCatalogService({ db })
  // What it is like outside where each family lives, cached per location
  // (JUG-25). It never fails a juego: unread weather leaves the ranking as it
  // was before the weather existed.
  const weather = createWeatherService({
    forecaster: forecaster === undefined ? createForecaster({ config: config.weather }) : forecaster,
    cacheMs: config.weather.cacheMs,
    logger: app.log,
    now,
  })
  // Discovery games (JUG-128), dealt when their juego is suggested.
  const games = createGamesService({ toys, random })
  // Whether the kids would enjoy each juego, as Jev reads it (JUG-200). Null
  // without TYPESAFE_API_KEY, and it never fails a juego either.
  const enjoyment = createEnjoyment({
    jev: jev === undefined ? createJev({ config: config.jev }) : jev,
    logger: app.log,
  })
  const activities = createActivitiesService({ db, catalog, families, games, materials, weather, enjoyment, random, now })
  // One LLM for stories and for reading a family's text; null without a key.
  const llmClient = llm ?? createLlm({ config: config.llm })
  // `model` is the model's name, which the story audit records beside each call.
  const stories = createStoriesService({
    db,
    catalog,
    families,
    random,
    now,
    llm: llmClient,
    model: config.llm.model,
    maxEpisodes: config.stories.episodesPerSeries,
    logger: app.log,
  })
  // The juegos played and the stories read lately (JUG-188).
  const history = createHistoryService({ activities, stories, now })
  // Keeps what parents send in their own words, only while AUDIT_TRANSCRIPTS is on.
  const audit = createAuditService({ db, enabled: config.audit.transcripts })
  const understanding = createUnderstanding({ llm: llmClient, audit })
  const toysUnderstanding = createToysUnderstanding({ llm: llmClient })
  const voice = createVoiceService({ transcriber: transcriber ?? createTranscriber({ config: config.stt }), families, audit })
  // Null without SMTP_HOST.
  const mailerClient = mailer === undefined ? createMailer({ config: config.email }) : mailer
  const invitations = createInvitationsService({ db, mailer: mailerClient, appUrl: config.auth.url, now })
  const auth = createAuth({ config: config.auth, db, invitations })
  const requireSession = createRequireSession(auth)
  const requireFamily = createRequireFamily(families)

  app.decorateRequest('session', null)
  app.decorateRequest('familyId', null)
  app.setErrorHandler(handleError)
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not found' }))

  // The one place access is decided. A route says `config: { access }`:
  // `public` for anyone, `session` for a signed-in adult, `family` for one who
  // has also saved a family. Without a config it is `session`, so a new route
  // is closed until it says otherwise. A hook that refuses answers and returns
  // its reply, which stops the request here.
  app.addHook('preHandler', async (request, reply) => {
    if (request.is404) return
    const { access = 'session' } = request.routeOptions.config
    if (access === 'public') return
    const refused = await requireSession(request, reply)
    if (refused) return refused
    if (access === 'family') return requireFamily(request, reply)
  })

  app.register(healthRoutes, { controller: createHealthController({ db }) })
  app.register(authRoutes, { auth, baseURL: config.auth.url })
  app.register(invitationsRoutes, { controller: createInvitationsController({ invitations }) })
  app.register(accountsRoutes, { controller: createAccountsController({ accounts, families, understanding }) })
  app.register(familiesRoutes, { controller: createFamiliesController({ families, understanding }) })
  app.register(toysRoutes, { controller: createToysController({ toys, toysUnderstanding }) })
  app.register(materialsRoutes, { controller: createMaterialsController({ materials }) })
  app.register(activitiesRoutes, { controller: createActivitiesController({ activities }) })
  app.register(gamesRoutes, { controller: createGamesController({ games }) })
  app.register(storiesRoutes, { controller: createStoriesController({ stories }) })
  app.register(historyRoutes, { controller: createHistoryController({ history }) })
  // Session access, not family: onboarding records a note before the family exists.
  app.register(voiceRoutes, { controller: createVoiceController({ voice }) })
  // The admin has no login yet, so it exists only where ADMIN_ENABLED turns it on.
  if (config.admin.enabled) {
    app.register(catalogRoutes, { controller: createCatalogController({ catalog, activities }) })
    app.register(adminUsersRoutes, { controller: createInvitationsController({ invitations }) })
    app.register(adminAccountsRoutes, { controller: createAccountsController({ accounts, families, understanding }) })
  }

  return app
}

/**
 * One shape for every failure. A client's own mistake gets its message, plus
 * the code a service gave it; ours are logged and never described. An
 * UnavailableError is the exception among the 5xx: it says a feature this
 * server wasn't configured for is off, which the web is meant to read.
 * @type {Parameters<import('fastify').FastifyInstance['setErrorHandler']>[0]}
 */
function handleError(error, request, reply) {
  const status = error.statusCode ?? 500
  if (status >= 500 && !(error instanceof UnavailableError)) {
    // A failed query's message carries its parameters, which can be a family's
    // names; log the query and what Postgres said instead.
    const logged = error instanceof DrizzleQueryError ? { err: error.cause, query: error.query } : { err: error }
    request.log.error(logged, 'request failed')
    return reply.code(500).send({ error: 'internal error' })
  }
  const code = error instanceof AppError ? error.code : undefined
  return reply.code(status).send(code ? { error: error.message, code } : { error: error.message })
}
