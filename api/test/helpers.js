import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { buildApp } from '../src/app.js'
import {
  DEFAULT_GEOCODING_URL,
  DEFAULT_JEV_MODEL,
  DEFAULT_JEV_URL,
  DEFAULT_SERIES_EPISODES,
  DEFAULT_SMTP_PORT,
  DEFAULT_WEATHER_CACHE_MINUTES,
  DEFAULT_WEATHER_URL,
} from '../src/config.js'
import { createDb } from '../src/db/client.js'
import { migrate } from '../src/db/migrate.js'
import { createInvitationsService } from '../src/invitations/invitations.service.js'

// A Postgres the tests can create databases in. `docker compose up db` is one.
const SERVER_URL = process.env.TEST_DATABASE_URL ?? 'postgres://ludi:ludi@localhost:5432/postgres'

export const ORIGIN = 'http://localhost:3000'

/** @typedef {import('../src/config.js').Config} Config */

/**
 * The config the API is built on in tests: no LLM, no speech-to-text, no
 * email, the admin off, and a secret that only tests use. Each part can be overridden
 * on its own; what isn't given keeps these defaults.
 * @param {{
 *   port?: number,
 *   databaseUrl?: string,
 *   auth?: Partial<Config['auth']>,
 *   llm?: Partial<Config['llm']>,
 *   stories?: Partial<Config['stories']>,
 *   stt?: Partial<Config['stt']>,
 *   weather?: Partial<Config['weather']>,
 *   places?: Partial<Config['places']>,
 *   jev?: Partial<Config['jev']>,
 *   email?: Partial<Config['email']>,
 *   admin?: Partial<Config['admin']>,
 *   audit?: Partial<Config['audit']>,
 * }} [overrides]
 * @returns {Config}
 */
export function testConfig({ auth, llm, stories, stt, weather, places, jev, email, admin, audit, ...rest } = {}) {
  return {
    port: 0,
    databaseUrl: '',
    // No Google client: Sign in with Google is off, unless a test passes its own `google` to startApi.
    auth: { url: ORIGIN, trustedOrigins: [], secret: 'test-secret-that-is-at-least-32-chars', google: null, ...auth },
    // No key: template stories, unless a test passes its own `llm` to startApi.
    llm: { provider: 'opencode', apiKey: null, baseUrl: '', model: '', appUrl: ORIGIN, ...llm },
    stories: { episodesPerSeries: DEFAULT_SERIES_EPISODES, ...stories },
    // No service: voice notes are off, unless a test passes its own `transcriber`.
    stt: { url: null, model: '', apiKey: null, ...stt },
    // The URLs the settings default to. Nothing reaches them: startApi gives
    // the app no forecaster and no geocoder unless a test passes its own.
    weather: { url: DEFAULT_WEATHER_URL, cacheMs: DEFAULT_WEATHER_CACHE_MINUTES * 60_000, ...weather },
    places: { url: DEFAULT_GEOCODING_URL, ...places },
    // No key: the ranking doesn't ask Jev, unless a test passes its own `jev` to startApi.
    jev: { url: DEFAULT_JEV_URL, apiKey: null, model: DEFAULT_JEV_MODEL, ...jev },
    email: { host: null, port: DEFAULT_SMTP_PORT, user: null, password: null, from: '', ...email },
    admin: { enabled: false, ...admin },
    audit: { transcripts: false, ...audit },
    ...rest,
  }
}

/** A profile close to the brief's example family. */
export const EXAMPLE_PROFILE = {
  kids: [{ name: 'Milán', ageMonths: 26, interests: ['los dinosaurios', 'los caballos'] }],
  pets: [{ name: 'Inca' }],
  toys: [
    { name: 'el dinosaurio chiquito' },
    { name: 'el tren grandote' },
    { name: 'el osito marrón' },
    { name: 'el caballo percherón' },
  ],
}

/** A new, empty database on the test server; `drop` removes it. */
export async function createDatabase() {
  const name = `ludi_test_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Client({ connectionString: SERVER_URL })
  await admin.connect()
  await admin.query(`create database ${name}`)

  const url = new URL(SERVER_URL)
  url.pathname = `/${name}`
  return {
    url: url.href,
    async drop() {
      // pool.end() resolves before every socket has closed. Wait for the server
      // to see them go instead of forcing them, so a real leak still fails the drop.
      for (let tries = 0; tries < 100; tries++) {
        const { rows } = await admin.query('select count(*)::int as open from pg_stat_activity where datname = $1', [name])
        if (rows[0].open === 0) break
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      await admin.query(`drop database ${name}`)
      await admin.end()
    },
  }
}

/**
 * A fresh database with every migration applied, and the API built on it.
 * Each test file starts its own, and `close` drops it.
 * No test reaches the internet: `forecaster`, `geocoder`, and `jev` are null
 * unless the test passes its own, so the weather is whatever it says it is
 * (JUG-25), and so is Jev (JUG-200).
 * @param {{ trustedOrigins?: string[], google?: Config['auth']['google'], random?: () => number, now?: () => Date, llm?: unknown, transcriber?: unknown, mailer?: import('../src/email/mailer.js').Mailer, forecaster?: import('../src/weather/open-meteo.js').Forecaster | null, geocoder?: import('../src/places/geocoder.js').Geocoder | null, jev?: import('../src/jev/typesafe.js').Jev | null, admin?: boolean, auditTranscripts?: boolean, maxEpisodes?: number }} [options]
 */
export async function startApi({
  trustedOrigins = [],
  google = null,
  random,
  now,
  llm,
  transcriber,
  mailer,
  forecaster = null,
  geocoder = null,
  jev = null,
  admin = false,
  auditTranscripts = false,
  maxEpisodes = DEFAULT_SERIES_EPISODES,
} = {}) {
  const database = await createDatabase()
  await migrate({ databaseUrl: database.url })

  const db = createDb(database.url)
  const config = testConfig({
    databaseUrl: database.url,
    auth: { trustedOrigins, google },
    stories: { episodesPerSeries: maxEpisodes },
    admin: { enabled: admin },
    audit: { transcripts: auditTranscripts },
  })
  const app = buildApp({ config, db, logger: false, random, now, llm, transcriber, mailer, forecaster, geocoder, jev })
  await app.ready()

  return {
    app,
    db,
    // The pool under `db`, for checking rows in plain SQL.
    pool: db.$client,
    config,
    databaseUrl: database.url,
    async close() {
      await app.close()
      await db.$client.end()
      await database.drop()
    },
  }
}

/**
 * Opens an invitation for an email, the way the admin does, and returns its
 * token. An invitation is the only way to create an account (JUG-34), so a
 * test that signs up needs one; nothing is emailed.
 * @param {Awaited<ReturnType<typeof startApi>>} api
 * @param {string} email
 * @returns {Promise<string>}
 */
export async function inviteEmail(api, email) {
  const invitations = createInvitationsService({ db: api.db, mailer: null, appUrl: ORIGIN })
  const { token } = await invitations.open(email)
  return token
}

/**
 * Invites an email, signs up through the API with that invitation, and returns
 * the user's id and session cookie.
 * @param {Awaited<ReturnType<typeof startApi>>} api
 * @param {string} email
 */
export async function signUpAs(api, email) {
  const invitation = await inviteEmail(api, email)
  const response = await api.app.inject({
    method: 'POST',
    url: '/auth/sign-up/email',
    payload: { name: 'Alex', email, password: 'una-clave-larga', invitation },
  })
  return { id: response.json().user.id, cookie: cookiesFrom(response) }
}

/**
 * Saves the signed-in adult's family profile.
 * @param {Awaited<ReturnType<typeof startApi>>} api
 * @param {string} cookie
 * @param {object} profile
 */
export function putFamily(api, cookie, profile) {
  return api.app.inject({ method: 'PUT', url: '/family', headers: { cookie }, payload: profile })
}

/**
 * The Cookie header a browser would send next, from a response's Set-Cookie.
 * @param {import('light-my-request').Response} response
 */
export function cookiesFrom(response) {
  return [response.headers['set-cookie'] ?? []]
    .flat()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

/**
 * The events of a server-sent event stream, as the route wrote them.
 * @param {string} body
 */
export function streamEvents(body) {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const line = /** @type {string} */ (block.split('\n').find((each) => each.startsWith('data: ')))
      return JSON.parse(line.slice('data: '.length))
    })
}

/**
 * The options an options stream sent, in order.
 * @param {import('light-my-request').Response} response
 */
export function optionsFrom(response) {
  return streamEvents(response.body.toString())
    .filter((event) => event.type === 'option')
    .map((event) => event.option)
}
