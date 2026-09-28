import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConfigError, loadConfig } from '../../src/config.js'

const REQUIRED = { BETTER_AUTH_URL: 'https://ludi.local:3000', BETTER_AUTH_SECRET: 'a-secret-that-is-at-least-32-chars' }
/** @param {NodeJS.ProcessEnv} env */
const llmOf = (env) => loadConfig({ ...REQUIRED, ...env }).llm

test('stories use OpenCode by default, with its default model', () => {
  assert.deepEqual(llmOf({ OPENCODE_API_KEY: 'oc-key' }), {
    provider: 'opencode',
    apiKey: 'oc-key',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    model: 'glm-5.3-flash',
    appUrl: 'https://ludi.local:3000',
  })
})

test('LLM_MODEL picks the model, and OPENCODE_MODEL still works as its old name', () => {
  assert.equal(llmOf({ OPENCODE_API_KEY: 'oc-key', LLM_MODEL: 'nuevo' }).model, 'nuevo')
  assert.equal(llmOf({ OPENCODE_API_KEY: 'oc-key', OPENCODE_MODEL: 'viejo' }).model, 'viejo')
  assert.equal(llmOf({ OPENCODE_API_KEY: 'oc-key', LLM_MODEL: 'nuevo', OPENCODE_MODEL: 'viejo' }).model, 'nuevo')
})

test('LLM_PROVIDER=openrouter uses the OpenRouter key and LLM_MODEL', () => {
  const llm = llmOf({
    LLM_PROVIDER: 'openrouter',
    LLM_MODEL: 'some-lab/some-model',
    OPENROUTER_API_KEY: 'or-key',
    OPENCODE_API_KEY: 'oc-key',
    OPENCODE_MODEL: 'viejo',
  })
  assert.equal(llm.provider, 'openrouter')
  assert.equal(llm.apiKey, 'or-key')
  assert.equal(llm.baseUrl, 'https://openrouter.ai/api/v1')
  assert.equal(llm.model, 'some-lab/some-model')
})

test('LLM_PROVIDER=claude-code uses the Claude Code token, with sonnet unless LLM_MODEL says otherwise', () => {
  assert.deepEqual(llmOf({ LLM_PROVIDER: 'claude-code', CLAUDE_CODE_OAUTH_TOKEN: 'cc-token', OPENCODE_API_KEY: 'oc-key' }), {
    provider: 'claude-code',
    apiKey: 'cc-token',
    baseUrl: '',
    model: 'sonnet',
    appUrl: 'https://ludi.local:3000',
  })
  assert.equal(llmOf({ LLM_PROVIDER: 'claude-code', CLAUDE_CODE_OAUTH_TOKEN: 'cc-token', LLM_MODEL: 'haiku' }).model, 'haiku')
  assert.equal(llmOf({ LLM_PROVIDER: 'claude-code', OPENCODE_API_KEY: 'oc-key' }).apiKey, null)
})

test('OpenRouter with a key and no model stops the API at startup', () => {
  assert.throws(
    () => llmOf({ LLM_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'or-key', OPENCODE_MODEL: 'viejo' }),
    (error) => error instanceof ConfigError && /LLM_MODEL/.test(error.message),
  )
})

test('without the chosen provider key, stories come from templates', () => {
  assert.equal(llmOf({ LLM_PROVIDER: 'openrouter', OPENCODE_API_KEY: 'oc-key' }).apiKey, null)
  assert.equal(llmOf({}).apiKey, null)
})

test('TRUSTED_ORIGINS adds origins for Better Auth, keeping only the origin of each URL', () => {
  const authOf = (env) => loadConfig({ ...REQUIRED, ...env }).auth
  assert.deepEqual(authOf({}).trustedOrigins, [])
  assert.deepEqual(
    authOf({ TRUSTED_ORIGINS: ' https://omarchy.tailnet.ts.net:8443/ , http://localhost:5173' }).trustedOrigins,
    ['https://omarchy.tailnet.ts.net:8443', 'http://localhost:5173'],
  )
  assert.throws(
    () => authOf({ TRUSTED_ORIGINS: 'omarchy.tailnet.ts.net' }),
    (error) => error instanceof ConfigError && /TRUSTED_ORIGINS/.test(error.message),
  )
})

test('Sign in with Google needs both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, and is off without them', () => {
  const googleOf = (env) => loadConfig({ ...REQUIRED, ...env }).auth.google
  assert.equal(googleOf({}), null)
  assert.deepEqual(googleOf({ GOOGLE_CLIENT_ID: ' id.apps.googleusercontent.com ', GOOGLE_CLIENT_SECRET: 'secret' }), {
    clientId: 'id.apps.googleusercontent.com',
    clientSecret: 'secret',
  })
  for (const env of [{ GOOGLE_CLIENT_ID: 'id' }, { GOOGLE_CLIENT_SECRET: 'secret' }]) {
    assert.throws(
      () => googleOf(env),
      (error) => error instanceof ConfigError && /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/.test(error.message),
    )
  }
})

test('an unknown provider stops the API at startup', () => {
  assert.throws(
    () => llmOf({ LLM_PROVIDER: 'openai' }),
    (error) => error instanceof ConfigError && /LLM_PROVIDER must be opencode, openrouter, or claude-code/.test(error.message),
  )
})


/** @param {NodeJS.ProcessEnv} env */
const analyticsOf = (env) => loadConfig({ ...REQUIRED, ...env }).analytics

test('the web loads GA only when a GA4 stream is set', () => {
  assert.equal(analyticsOf({}), null, 'off unless it is set up')
  assert.equal(analyticsOf({ ANALYTICS_DEBUG: 'true' }), null, 'debug alone turns nothing on')
  assert.deepEqual(analyticsOf({ ANALYTICS_MEASUREMENT_ID: ' G-ABC123XYZ ' }), { measurementId: 'G-ABC123XYZ', debug: false })
  assert.equal(analyticsOf({ ANALYTICS_MEASUREMENT_ID: 'G-ABC123XYZ', ANALYTICS_DEBUG: 'true' })?.debug, true)
})

test('an id that is not a GA4 web stream is refused, since the web would put it in a script URL', () => {
  for (const id of ['UA-12345-1', 'G-abc"><script>', 'GTM-ABC123']) {
    assert.throws(
      () => analyticsOf({ ANALYTICS_MEASUREMENT_ID: id }),
      (error) => error instanceof ConfigError && /ANALYTICS_MEASUREMENT_ID/.test(error.message),
    )
  }
})
