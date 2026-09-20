import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { APIError, getOAuthState } from 'better-auth/api'
import { accounts, sessions, users, verifications } from './auth.schema.js'

/** @typedef {import('../config.js').AuthConfig} AuthConfig */
/** @typedef {import('../invitations/invitations.service.js').InvitationsService} InvitationsService */
/** @typedef {ReturnType<typeof createAuth>} Auth */

const DAY_SECONDS = 60 * 60 * 24

/**
 * @param {{
 *   config: AuthConfig,
 *   db: import('../db/client.js').Db,
 *   invitations: InvitationsService,
 *   usage?: import('../usage/usage.service.js').UsageService | null,
 * }} deps `usage` counts the accounts created (JUG-198); absent, nothing is counted.
 */
export function createAuth({ config, db, invitations, usage = null }) {
  return betterAuth({
    baseURL: config.url,
    // The phone reaches the stack through Tailscale, at another origin than BETTER_AUTH_URL.
    trustedOrigins: config.trustedOrigins,
    secret: config.secret,
    // Its tables are ours, in auth.schema.js, with plural names like every other table.
    database: drizzleAdapter(db, { provider: 'pg', schema: { users, sessions, accounts, verifications }, usePlural: true }),
    emailAndPassword: { enabled: true },
    socialProviders: config.google ? { google: googleProvider(config.google) } : {},
    account: {
      accountLinking: {
        // Google links to the account with the same email only when Google
        // says the email is verified. Ludi doesn't verify emails yet, so the
        // account it links to can't be required to have a verified one.
        requireLocalEmailVerified: false,
      },
    },
    // Where Google sends the parent back when a sign-in fails before Ludi
    // knows which screen it started from, such as one left open too long.
    onAPIError: { errorURL: '/entrada' },
    // A parent who opens the app once a month stays signed in: the session
    // lasts 30 days and starts over on the first use of each day.
    session: { expiresIn: 30 * DAY_SECONDS, updateAge: DAY_SECONDS },
    databaseHooks: {
      user: {
        create: {
          // No outside testers until the guardrails are complete: an account
          // is created only for an email holding an open invitation, and only
          // with that invitation's token, whatever the sign-in method (JUG-34).
          before: async (user, context) => {
            const email = user.email.toLowerCase()
            const token = await invitationTokenOf(context)
            const invited = token ? await invitations.admits(token, email) : null
            // The link came to this email, so following it verifies the email.
            if (invited === 'admitted') return { data: { ...user, emailVerified: true } }
            if (invited === 'other-email') {
              throw new APIError('FORBIDDEN', { code: 'INVITATION_OTHER_EMAIL', message: 'The invitation is for another email' })
            }
            throw new APIError('FORBIDDEN', { code: 'SIGNUP_NOT_ALLOWED', message: 'Sign-up is by invitation only' })
          },
          after: async (user) => {
            await invitations.accept(user.email)
            // Signing up, not finishing onboarding: the family comes later,
            // and the gap between the two is the drop-off (JUG-198).
            await usage?.record('account_created', { userId: user.id })
          },
        },
      },
    },
  })
}

/**
 * The invitation token a sign-up carries: `invitation` in the body of an email
 * sign-up, or in the `additionalData` a Google sign-in started with, which
 * comes back in the OAuth state on Google's callback. The client sends it
 * either way, so it counts only when the invitations service finds it open.
 * @param {{ path?: string, body?: unknown } | null} context the Better Auth endpoint the user is created in
 * @returns {Promise<string | null>}
 */
async function invitationTokenOf(context) {
  const fromBody = /** @type {{ invitation?: unknown } | undefined} */ (context?.body)?.invitation
  // The OAuth state exists only while an OAuth callback is handled.
  const fromState = context?.path?.startsWith('/callback/') ? (await getOAuthState())?.invitation : undefined
  const token = fromBody ?? fromState
  return typeof token === 'string' && token.length > 0 && token.length <= 128 ? token : null
}

/**
 * Sign in with Google. It asks only for what signing in needs, which is
 * Better Auth's default: the `openid`, `email`, and `profile` scopes, with no
 * offline access. The profile's picture isn't kept.
 * @param {import('../config.js').GoogleConfig} google
 */
function googleProvider({ clientId, clientSecret }) {
  return {
    clientId,
    clientSecret,
    // A shared phone often has more than one Google account on it.
    prompt: /** @type {const} */ ('select_account'),
    mapProfileToUser: () => ({ image: null }),
  }
}
