/**
 * The API's configuration, read from the environment once at startup.
 * Anything missing or malformed stops the process with a message saying what
 * to set, instead of failing later on a request.
 */

const LOCAL_DATABASE_URL = 'postgres://ludi:ludi@localhost:5432/ludi'

/**
 * The LLM providers stories can use: the setting that holds each one's key,
 * its API, and its default model. OpenRouter has no default, since its model
 * ids name the upstream lab and change often. Claude Code runs its CLI, so it
 * has no API URL, and its key is an OAuth token from `claude setup-token`.
 */
const LLM_PROVIDERS = {
  opencode: { keyVar: 'OPENCODE_API_KEY', baseUrl: 'https://opencode.ai/zen/go/v1', model: 'glm-5.3-flash' },
  openrouter: { keyVar: 'OPENROUTER_API_KEY', baseUrl: 'https://openrouter.ai/api/v1', model: '' },
  'claude-code': { keyVar: 'CLAUDE_CODE_OAUTH_TOKEN', baseUrl: '', model: 'sonnet' },
}

/**
 * @typedef {object} AuthConfig
 * @property {string} url the public origin the app is served from
 * @property {string[]} trustedOrigins other origins the app is also opened from, such as Tailscale's for a phone
 * @property {string} secret signs sessions; at least 32 characters
 * @property {GoogleConfig | null} google the OAuth client for Sign in with Google; without it Google sign-in is off
 */

/**
 * @typedef {object} GoogleConfig
 * @property {string} clientId
 * @property {string} clientSecret
 */

/**
 * @typedef {object} LlmConfig
 * @property {'opencode' | 'openrouter' | 'claude-code'} provider which LLM writes the stories
 * @property {string | null} apiKey the chosen provider's key; without it stories come from templates
 * @property {string} baseUrl empty for Claude Code, which has no API URL
 * @property {string} model as the provider names it
 * @property {string} appUrl the public origin, which OpenRouter records as the app's URL
 * @property {string} [command] the Claude Code CLI to run, `claude` on the PATH unless tests set another
 */

/**
 * @typedef {object} StoriesConfig
 * @property {number} episodesPerSeries how many episodes one story series may hold (JUG-59)
 */

/**
 * @typedef {object} SttConfig
 * @property {string | null} url an OpenAI-compatible transcriptions API, up to its /v1; without it voice notes are off
 * @property {string} model as the service names it
 * @property {string | null} apiKey for a hosted service; the self-hosted one needs none
 */

/**
 * @typedef {object} WeatherConfig
 * @property {string} url an Open-Meteo forecast API, up to its /v1
 * @property {number} cacheMs how long one location's forecast is kept on the server
 */

/**
 * @typedef {object} JevConfig
 * @property {string} url TypeSafe's System One API, up to its /v1
 * @property {string | null} apiKey without it the ranking doesn't ask Jev (JUG-200)
 * @property {string} model as TypeSafe names it
 */

/**
 * @typedef {object} PlacesConfig
 * @property {string} url an Open-Meteo geocoding API, up to its /v1
 */

/**
 * @typedef {object} EmailConfig
 * @property {string | null} host the SMTP service; without it email is off
 * @property {number} port 465 and 2465 use TLS from the start; any other port must upgrade with STARTTLS
 * @property {string | null} user
 * @property {string | null} password for Resend, an API key
 * @property {string} from the sender, such as `Ludi <hola@ludi.ar>`
 */

/**
 * @typedef {object} Config
 * @property {number} port
 * @property {string} databaseUrl
 * @property {AuthConfig} auth
 * @property {LlmConfig} llm
 * @property {StoriesConfig} stories
 * @property {SttConfig} stt speech to text, for voice notes
 * @property {WeatherConfig} weather what it is like where the family lives (JUG-25)
 * @property {PlacesConfig} places putting the family's words for where they live on the map (JUG-25)
 * @property {JevConfig} jev whether the kids would enjoy a juego, as Jev reads it (JUG-200)
 * @property {EmailConfig} email the SMTP service email is sent through (JUG-169)
 * @property {{ enabled: boolean }} admin the catalog admin, which has no login yet
 * @property {{ transcripts: boolean }} audit whether parents' own words are kept in audit_transcripts (JUG-116)
 */

/** How many episodes a story series holds before it is finished (JUG-59). */
export const DEFAULT_SERIES_EPISODES = 10

/**
 * Open-Meteo, which asks for no account and no key, so the weather works in a
 * fresh checkout. Its free service is for non-commercial use; a paid plan is
 * a change of WEATHER_URL and GEOCODING_URL.
 */
export const DEFAULT_WEATHER_URL = 'https://api.open-meteo.com/v1'
export const DEFAULT_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1'

/**
 * How long one location's forecast is kept, in minutes. Open-Meteo writes a
 * new one every fifteen, and everyone in a city shares the entry.
 */
export const DEFAULT_WEATHER_CACHE_MINUTES = 15

/**
 * TypeSafe's API and its alias for the latest stable Jev. The alias moves with
 * each release; JEV_MODEL pins a version such as jev-1.13.0.
 */
export const DEFAULT_JEV_URL = 'https://api.typesafe.ai/v1'
export const DEFAULT_JEV_MODEL = 'jev-latest'

/** Whisper small, as the self-hosted speaches server names it. */
export const DEFAULT_STT_MODEL = 'Systran/faster-whisper-small'

/**
 * Resend's port for SMTP over TLS. DigitalOcean blocks 25, 465, and 587 on
 * droplets, and leaves this one open.
 */
export const DEFAULT_SMTP_PORT = 2465

export class ConfigError extends Error {}

/** The one setting the migrations need. @param {NodeJS.ProcessEnv} [env] */
export function loadDatabaseUrl(env = process.env) {
  return env.DATABASE_URL?.trim() || LOCAL_DATABASE_URL
}

/** @param {NodeJS.ProcessEnv} [env] @returns {Config} */
export function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port <= 0) throw new ConfigError(`PORT must be a port number, not "${env.PORT}"`)

  const url = required(env, 'BETTER_AUTH_URL')
  if (!URL.canParse(url)) throw new ConfigError(`BETTER_AUTH_URL must be a URL, not "${url}"`)

  const secret = required(env, 'BETTER_AUTH_SECRET')
  if (secret.length < 32) {
    throw new ConfigError('BETTER_AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)')
  }

  return {
    port,
    databaseUrl: loadDatabaseUrl(env),
    auth: {
      url,
      trustedOrigins: originList(env.TRUSTED_ORIGINS),
      secret,
      google: loadGoogle(env),
    },
    llm: loadLlm(env, url),
    stories: { episodesPerSeries: whole(env, 'STORY_SERIES_EPISODES', DEFAULT_SERIES_EPISODES, 2) },
    stt: loadStt(env),
    weather: {
      url: serviceUrl(env, 'WEATHER_URL', DEFAULT_WEATHER_URL),
      cacheMs: whole(env, 'WEATHER_CACHE_MINUTES', DEFAULT_WEATHER_CACHE_MINUTES, 1) * 60_000,
    },
    places: { url: serviceUrl(env, 'GEOCODING_URL', DEFAULT_GEOCODING_URL) },
    jev: {
      url: serviceUrl(env, 'TYPESAFE_URL', DEFAULT_JEV_URL),
      apiKey: env.TYPESAFE_API_KEY?.trim() || null,
      model: env.JEV_MODEL?.trim() || DEFAULT_JEV_MODEL,
    },
    email: loadEmail(env),
    admin: { enabled: flag(env, 'ADMIN_ENABLED') },
    // Off unless set: the texts hold the family's names.
    audit: { transcripts: flag(env, 'AUDIT_TRANSCRIPTS') },
  }
}

/**
 * The OAuth client for Sign in with Google, from Google Cloud's console. Both
 * settings or neither: one without the other is a mistake worth stopping for.
 * @param {NodeJS.ProcessEnv} env
 * @returns {GoogleConfig | null}
 */
function loadGoogle(env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId && !clientSecret) return null
  if (!clientId || !clientSecret) {
    throw new ConfigError('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET go together: set both for Sign in with Google, or neither')
  }
  return { clientId, clientSecret }
}

/**
 * The speech-to-text service for voice notes. Compose points STT_URL at its
 * own Whisper server; a hosted service needs its URL, model, and key instead.
 * @param {NodeJS.ProcessEnv} env
 * @returns {SttConfig}
 */
function loadStt(env) {
  const url = env.STT_URL?.trim() || null
  if (url && !URL.canParse(url)) throw new ConfigError(`STT_URL must be a URL, not "${env.STT_URL}"`)
  return { url, model: env.STT_MODEL?.trim() || DEFAULT_STT_MODEL, apiKey: env.STT_API_KEY?.trim() || null }
}

/**
 * The SMTP service email is sent through. Without SMTP_HOST email is off; with
 * it, EMAIL_FROM says who it comes from.
 * @param {NodeJS.ProcessEnv} env
 * @returns {EmailConfig}
 */
function loadEmail(env) {
  const host = env.SMTP_HOST?.trim() || null
  const port = whole(env, 'SMTP_PORT', DEFAULT_SMTP_PORT, 1)
  const user = env.SMTP_USER?.trim() || null
  const password = env.SMTP_PASSWORD?.trim() || null
  const from = env.EMAIL_FROM?.trim() || ''
  if (host && !from) throw new ConfigError('EMAIL_FROM is not set, and SMTP_HOST needs it: the sender, such as "Ludi <hola@ludi.ar>"')
  if (Boolean(user) !== Boolean(password)) throw new ConfigError('SMTP_USER and SMTP_PASSWORD must be set together')
  return { host, port, user, password, from }
}

/**
 * Which provider writes the stories, with which key and model. LLM_PROVIDER
 * defaults to OpenCode. The model comes from LLM_MODEL; OPENCODE_MODEL is its
 * old name and is still read for OpenCode.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} appUrl
 * @returns {LlmConfig}
 */
function loadLlm(env, appUrl) {
  const name = env.LLM_PROVIDER?.trim().toLowerCase() || 'opencode'
  if (!Object.hasOwn(LLM_PROVIDERS, name)) {
    throw new ConfigError(`LLM_PROVIDER must be opencode, openrouter, or claude-code, not "${env.LLM_PROVIDER}"`)
  }
  const provider = /** @type {keyof typeof LLM_PROVIDERS} */ (name)
  const { keyVar, baseUrl, model: defaultModel } = LLM_PROVIDERS[provider]
  const apiKey = env[keyVar]?.trim() || null
  const oldModel = provider === 'opencode' ? env.OPENCODE_MODEL?.trim() : ''
  const model = env.LLM_MODEL?.trim() || oldModel || defaultModel
  if (apiKey && !model) {
    throw new ConfigError(`LLM_MODEL is not set, and ${provider} has no default model. Set it to a model id from openrouter.ai/models`)
  }
  return { provider, apiKey, baseUrl, model, appUrl }
}

/**
 * A whole-number setting, with the value it keeps when nobody sets it.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} name
 * @param {number} fallback
 * @param {number} least the smallest value that still makes sense
 */
function whole(env, name, fallback, least) {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < least) {
    throw new ConfigError(`${name} must be a whole number of at least ${least}, not "${env[name]}"`)
  }
  return value
}

/**
 * The URL of a service that has a default, checked at startup rather than on
 * the request that needs it.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} name
 * @param {string} fallback
 */
function serviceUrl(env, name, fallback) {
  const url = env[name]?.trim() || fallback
  if (!URL.canParse(url)) throw new ConfigError(`${name} must be a URL, not "${env[name]}"`)
  return url
}

/** A true or false setting, false when unset. @param {NodeJS.ProcessEnv} env @param {string} name */
function flag(env, name) {
  const value = env[name]?.trim().toLowerCase() || 'false'
  if (value !== 'true' && value !== 'false') throw new ConfigError(`${name} must be true or false, not "${env[name]}"`)
  return value === 'true'
}

/** @param {NodeJS.ProcessEnv} env @param {string} name */
function required(env, name) {
  const value = env[name]?.trim()
  if (!value) throw new ConfigError(`${name} is not set`)
  return value
}

/**
 * Origins Better Auth accepts besides BETTER_AUTH_URL's. It refuses sign-in
 * and sign-up from any other with "Invalid origin".
 * @param {string} [list] comma-separated URLs; only their origins are kept
 */
function originList(list = '') {
  return list
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (!URL.canParse(entry)) throw new ConfigError(`TRUSTED_ORIGINS must be comma-separated URLs, and "${entry}" isn't one`)
      return new URL(entry).origin
    })
}

