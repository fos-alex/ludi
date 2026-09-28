// Styles first, in this order: fonts, tokens and base, then the primitives.
// Every feature's CSS loads after these with its screen, so it can restyle a
// primitive at the same specificity.
import '@fontsource-variable/fredoka'
import '@fontsource-variable/nunito-sans'
import '../styles/index.css'
import '../shared/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'
import { startAnalytics } from '../shared/analytics'
import { upgradeCachedFamily } from '../features/family'
import { keepUpToDate } from './updates'
import { applyInitialTheme } from './ThemeProvider'

const router = createRouter({ routeTree, defaultPreload: 'intent' })

if (import.meta.env.PROD) void keepUpToDate(router)
// Page views from the router, and GA once the page is idle, if the API has a stream (JUG-201).
startAnalytics(router)

applyInitialTheme()
upgradeCachedFamily()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
