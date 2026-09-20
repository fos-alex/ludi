/**
 * The admin: the catalog's activity templates, and the accounts and
 * invitations. The admin has no login yet, so the API serves these only where
 * ADMIN_ENABLED turns it on.
 */
import { request } from '../../shared/http'

/** @typedef {import('./types').ActivityTemplate} ActivityTemplate */
/** @typedef {import('./types').ActivityTemplateFields} ActivityTemplateFields */
/** @typedef {import('./types').MaterialCategory} MaterialCategory */
/** @typedef {import('./types').Theme} Theme */
/** @typedef {import('./types').AdminAccount} AdminAccount */
/** @typedef {import('./types').Invitation} Invitation */
/** @typedef {import('./types').SentInvitation} SentInvitation */
/** @typedef {import('./types').Usage} Usage */

const TEMPLATES = '/admin/activity-templates'

/** Every template in the catalog, on or off. @returns {Promise<ActivityTemplate[]>} */
export function listTemplates() {
  return request('GET', TEMPLATES)
}

/** @param {string} id @returns {Promise<ActivityTemplate>} */
export function loadTemplate(id) {
  return request('GET', `${TEMPLATES}/${id}`)
}

/** @param {ActivityTemplateFields & { slug: string }} template @returns {Promise<ActivityTemplate>} */
export function createTemplate(template) {
  return request('POST', TEMPLATES, template)
}

/**
 * Saves everything but the slug, which never changes.
 * @param {string} id
 * @param {ActivityTemplateFields} template
 * @returns {Promise<ActivityTemplate>}
 */
export function saveTemplate(id, template) {
  return request('PUT', `${TEMPLATES}/${id}`, template)
}

/** Deletes a template for good: the catalog seed never brings it back. @param {string} id */
export async function deleteTemplate(id) {
  await request('DELETE', `${TEMPLATES}/${id}`)
}

/** The materials a template can name, by category. @returns {Promise<MaterialCategory[]>} */
export function listMaterials() {
  return request('GET', '/admin/materials')
}

/** The themes a template can be about. @returns {Promise<Theme[]>} */
export function listThemes() {
  return request('GET', '/admin/themes')
}

/** Every account, and every invitation sent. @returns {Promise<{ users: AdminAccount[], invitations: Invitation[] }>} */
export function listUsers() {
  return request('GET', '/admin/users')
}

/**
 * Invites an email to Ludi: the API sends it a link to sign up. Inviting it
 * again sends a new link, and the one before stops working (JUG-34). With
 * email off, the answer carries the link instead of sending it.
 * @param {string} email
 * @returns {Promise<SentInvitation>}
 */
export function invite(email) {
  return request('POST', '/admin/invitations', { email })
}

/**
 * Removes an account and everything it owns: its family, the kids, the toys,
 * the materials, the juegos, and the cuentos (JUG-175). Its devices sign out.
 * @param {string} id
 */
export async function deleteAccount(id) {
  await request('DELETE', `/admin/users/${id}`)
}

/**
 * What families have done with Ludi (JUG-199): the totals, the last week, and
 * a count per day for the last three months. Counted by the API itself, so
 * nothing here is measured in the browser.
 * @returns {Promise<Usage>}
 */
export function listUsage() {
  return request('GET', '/admin/usage')
}
