/**
 * Adding Ludi to the home screen (JUG-202). A new account is offered it once,
 * on its first Home. Browsers that can install on their own hand the page a
 * `beforeinstallprompt` event, which is kept here until the parent taps the
 * button; iPhones never send one, so the sheet says how instead.
 */
import { read, write } from '../../shared/store'

/**
 * @typedef {Event & { prompt: () => Promise<void>, userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }} InstallPromptEvent
 * @typedef {'prompt' | 'iphone' | 'android'} InstallWay How this device installs: with the browser's own
 *   dialog, with Safari's share menu, or from Chrome's menu, for an Android browser that can't prompt.
 */

/** @type {InstallPromptEvent | null} */
let deferred = null
const listeners = new Set()

function notify() {
  for (const listener of listeners) listener()
}

/**
 * Keeps the browser's install prompt for later. It can arrive long before
 * Home, so app/main.jsx starts listening when the page loads.
 */
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = /** @type {InstallPromptEvent} */ (event)
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    write('installOffer', null)
  })
}

/** @param {() => void} listener */
export function onPromptChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Marks this device to be offered the install on its next Home. */
export function offerInstall() {
  write('installOffer', true)
}

export function installOffered() {
  return read('installOffer') === true
}

/** The offer is over, installed or not: it isn't made again. */
export function endInstallOffer() {
  write('installOffer', null)
}

/**
 * How this device can install Ludi, or null when it can't or already has:
 * running as the installed app, or on a computer.
 * @returns {InstallWay | null}
 */
export function installWay() {
  if (window.matchMedia('(display-mode: standalone)').matches) return null
  if (/** @type {{ standalone?: boolean }} */ (navigator).standalone) return null
  if (deferred) return 'prompt'
  const agent = navigator.userAgent
  // An iPad asks for the desktop site, so it says Macintosh, but has a touch screen.
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return 'iphone'
  // Chrome would have prompted: this is another browser, or one inside an app like Gmail.
  if (/Android/.test(agent)) return 'android'
  return null
}

/** Opens the browser's install dialog. Resolves whether the parent installed. */
export async function promptInstall() {
  const event = deferred
  if (!event) return false
  // A prompt can be shown only once.
  deferred = null
  notify()
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome === 'accepted'
}
