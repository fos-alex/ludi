/**
 * Google Analytics 4 in the browser (JUG-201), for what the server can't see:
 * sessions, devices, screens, and where people leave a flow. The exact counts
 * are the API's own (JUG-198), on the admin's Uso page; GA is for exploring.
 *
 * Three rules hold it together:
 *
 * - **It never costs the first screen.** GA's script loads only once the page
 *   has finished loading and the browser is idle, and the API is asked first
 *   whether there is a GA stream at all. Without one, nothing loads.
 * - **Google gets the route, never the URL or the title.** A page view names
 *   the route as the router declares it, `/cuento/$id`, and the title is the
 *   same. Titles carry juego and story titles, which name the kids and their
 *   toys, and URLs can carry an email (`/invitacion?email=`) or an interest the
 *   parent typed (`/cuento/tema/$keyword`). The same scrubbed values are `set`
 *   for everything GA collects by itself, like scrolls and clicks.
 * - **Nothing here can fail a screen.** Every call is a no-op until GA is on,
 *   and events from before it loads wait in a short queue.
 *
 * Google signals and ads personalisation are off. The admin is Alex's tool,
 * not a family's, so its pages are not reported.
 */
import { request } from './http'

/** How long the browser gets to be idle before GA loads anyway. */
const IDLE_TIMEOUT_MS = 4000

/** Events kept while GA loads; the rest are dropped rather than grow without end. */
const MAX_WAITING = 50

/** @typedef {'loading' | 'off' | 'on'} State */
/** @typedef {{ page_location: string, page_title: string }} Page */

/** @type {State} */
let state = 'loading'
/** @type {[string, Record<string, unknown>][]} */
let waiting = []
/**
 * The page as Google is told it, never the real URL or title. It starts as the
 * site's root, so nothing GA sends before the first route resolves can fall
 * back to the real address.
 * @type {Page}
 */
let page = { page_location: `${location.origin}/`, page_title: '/' }
/** Whether a page view has been sent, so the first one has no referrer of ours. */
let viewed = false

/**
 * Starts counting page views from the router, and loads GA once the page is
 * idle, if the API says there is a stream.
 * @param {import('@tanstack/react-router').AnyRouter} router
 */
export function startAnalytics(router) {
  router.subscribe('onResolved', ({ pathChanged }) => {
    // The router also resolves again in place, when the app comes back to the
    // foreground and the session is checked. That is no new page.
    if (!pathChanged) return
    // An index route's template ends in a slash (`/idea/$id/`); the page is the same.
    const path = (router.state.matches.at(-1)?.fullPath ?? '/').replace(/(.)\/$/, '$1')
    if (path.startsWith('/admin')) return
    const referrer = viewed ? page.page_location : ''
    viewed = true
    page = { page_location: `${location.origin}${path}`, page_title: path }
    if (state === 'on') window.gtag('set', page)
    send('page_view', { ...page, page_referrer: referrer })
  })
  whenIdle(load)
}

/**
 * Tells GA something a family did, once the API has taken it. The names are
 * the API's own (JUG-198), so the two read the same.
 * @param {'juego_shown' | 'juego_played' | 'story_told' | 'series_started' | 'family_created'} event
 */
export function track(event) {
  send(event, { ...page })
}

/** @param {string} name @param {Record<string, unknown>} params */
function send(name, params) {
  if (state === 'off') return
  if (state === 'loading') {
    if (waiting.length < MAX_WAITING) waiting.push([name, params])
    return
  }
  window.gtag('event', name, params)
}

async function load() {
  /** @type {{ measurementId: string | null, debug: boolean }} */
  let stream
  try {
    stream = await request('GET', '/analytics')
  } catch {
    // Offline, or the API didn't answer: try again once the phone is back.
    window.addEventListener('online', () => whenIdle(load), { once: true })
    return
  }
  if (!stream.measurementId) {
    state = 'off'
    waiting = []
    return
  }

  window.dataLayer = window.dataLayer || []
  // GA reads `arguments` itself, so this has to be a function, not an arrow.
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('set', { ...page, page_referrer: '' })
  window.gtag('config', stream.measurementId, {
    // Every page view is ours, from the router, with the route in it.
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    // Only when asked: GA treats the parameter's presence as debug, whatever its value.
    ...(stream.debug ? { debug_mode: true } : {}),
  })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(stream.measurementId)}`
  document.head.append(script)

  state = 'on'
  for (const [name, params] of waiting) window.gtag('event', name, params)
  waiting = []
}

/** Runs after the page has loaded, once the browser has nothing better to do. @param {() => void} run */
function whenIdle(run) {
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS }) : setTimeout(run, 1000))
  if (document.readyState === 'complete') idle()
  else window.addEventListener('load', idle, { once: true })
}
