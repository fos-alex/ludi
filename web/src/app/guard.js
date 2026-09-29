import { redirect } from '@tanstack/react-router'
import { ensureSession } from '../features/account'
import { offerInstall } from '../features/install'
import { read } from '../shared/store'

/** @typedef {import('../features/account').Account} Account */

const SIGNED_OUT = ['/entrada', '/cuenta', '/invitacion']
const FIRST_RUN = ['/bienvenida', '/familia/contanos', '/familia/revisar', '/familia/corregir']

/**
 * The root route's `beforeLoad`: before each navigation, confirms the session
 * and sends the parent where the first run says they belong.
 * @param {{ location: { pathname: string } }} context
 */
export async function guard({ location }) {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  // The catalog admin has no login yet, and needs no family.
  if (path === '/admin' || path.startsWith('/admin/')) return
  const account = await ensureSession()
  // Every new account is sent to /bienvenida, an invited one too, even though
  // with a family it goes straight on Home: its first Home offers the install (JUG-202).
  if (path === '/bienvenida' && account) offerInstall()
  const target = firstRunTarget(path, account, {
    hasFamily: Boolean(read('family')),
    sessionEnded: Boolean(read('sessionEnded')),
  })
  if (target) throw redirect({ ...target, replace: true })
}

/**
 * Keeps the first run in order: a signed-in account, a family, then the app.
 * Returns where the parent belongs, or null when the path is fine. A session
 * that ended sends them to sign in again; a device that never had one, or
 * signed out, to the entry. A new account lands on /bienvenida (JUG-173),
 * which only an account without a family can open. The family starts from the
 * parent's own words when the API has an LLM to read them (JUG-11), and in the
 * form when it doesn't. Verifying the email waits until the API sends email,
 * so /verificar sends them on. Pure: what the device knows comes in `device`.
 * @param {string} path
 * @param {Account | null} account
 * @param {{ hasFamily: boolean, sessionEnded: boolean }} device
 * @returns {{ to: string, search?: { modo: 'entrar' } } | null}
 */
export function firstRunTarget(path, account, { hasFamily, sessionEnded }) {
  if (!account) {
    if (SIGNED_OUT.includes(path)) return null
    return sessionEnded ? { to: '/cuenta', search: { modo: 'entrar' } } : { to: '/entrada' }
  }
  if (!hasFamily) {
    if (FIRST_RUN.includes(path)) return null
    return { to: account.familyFromText ? '/familia/contanos' : '/familia/corregir' }
  }
  if ([...SIGNED_OUT, '/verificar', '/bienvenida', '/familia/contanos', '/familia/revisar'].includes(path)) return { to: '/' }
  return null
}
