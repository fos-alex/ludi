import { userOf } from '../auth/session.js'
import { familyOf } from '../families/require-family.js'

/** @typedef {import('./activities.service.js').ActivitiesService} ActivitiesService */
/** @typedef {import('./choices.js').Choices} Choices */

/** Activities for the signed-in adult's family. @param {{ activities: ActivitiesService }} deps */
export function createActivitiesController({ activities }) {
  return {
    /** @type {import('fastify').RouteHandlerMethod} */
    async suggest(request, reply) {
      // `mood` left out is not the same as null: without it the clock decides.
      const {
        after = null,
        reuseMaterials = false,
        mood,
        place = null,
        sound = null,
        category = null,
      } = /** @type {{ after?: string | null, reuseMaterials?: boolean, mood?: 'calm' | 'lively' | null } & Partial<Choices>} */ (
        request.body ?? {}
      )
      const activity = await activities.suggest(familyOf(request), {
        after,
        reuseMaterials,
        mood,
        choices: { place, sound, category },
        userId: userOf(request).id,
      })
      return reply.code(201).send(activity)
    },

    /** @type {import('fastify').RouteHandlerMethod} */
    async outside(request) {
      return activities.outside(familyOf(request))
    },

    /** @type {import('fastify').RouteHandlerMethod} */
    async react(request) {
      const { id } = /** @type {{ id: string }} */ (request.params)
      const { reaction } = /** @type {{ reaction: 'up' | 'down' | null }} */ (request.body)
      return activities.react(familyOf(request), id, reaction)
    },

    /** @type {import('fastify').RouteHandlerMethod} */
    async find(request) {
      const { id } = /** @type {{ id: string }} */ (request.params)
      return activities.find(familyOf(request), id)
    },

    /** @type {import('fastify').RouteHandlerMethod} */
    async play(request, reply) {
      const { id } = /** @type {{ id: string }} */ (request.params)
      await activities.play(familyOf(request), id, { userId: userOf(request).id })
      return reply.code(204).send()
    },
  }
}
