# Ludi — Architecture

*A living document. It holds the technical decisions and the reasons behind them, so a decision can be revisited on purpose rather than drifted away from. How the code is actually laid out is in [web/AGENTS.md](../web/AGENTS.md) and [api/AGENTS.md](../api/AGENTS.md); what the product is, in [product-concept.md](product-concept.md); the principles, in [constitution.md](constitution.md).*

Version 1 targets Argentina, ages 1–5, on responsive web.

## Decisions

| Area | Decision |
|---|---|
| Client | React SPA built with Vite, TanStack Router, no UI component library, shipped as static files served by Caddy |
| Devices | Mobile-first: mid-range Android and iPhone, Chrome and Safari. Desktop is not a target |
| Offline | Service worker for the app shell; an app-owned IndexedDB store for data |
| Server | Node.js HTTP API (Fastify), long-running |
| Database | PostgreSQL. If content grows heavy, a CMS with its own database joins later |
| Database access | Drizzle ORM: the schema is code, drizzle-kit generates the SQL migrations from it (JUG-105) |
| Hosting | An existing DigitalOcean droplet, at `https://ludi.ar` |
| Local development | Docker Compose, the same file as production, at `https://ludi.local` |
| TLS and proxy | Caddy: automatic certificates in production, its internal CA locally |
| Language | JavaScript with JSDoc on both sides. Not typechecked, and that is deliberate (JUG-70): TypeScript was tried and dropped when the shared contract package proved only theoretical |
| Repo layout | One repo, npm workspaces (`api`, `web`): one install, separate codebases, no shared package |
| Authentication | Better Auth in the API: email and password, and Sign in with Google, with sessions in PostgreSQL behind an httpOnly cookie. An account can only be created from an invitation sent from the admin, whatever the sign-in method (JUG-34) |
| Native apps | Not in v1. After 1.0: native Android/iOS or React Native, decided then |

## Why the droplet

Version 1 runs on the DigitalOcean droplet that already exists. Vercel's free Hobby plan was rejected for three reasons.

**Hobby is non-commercial only.** Vercel restricts Hobby teams to personal use and requires Pro for anything used for financial gain. Ludi is meant to be a real product, so that foundation would have to be abandoned as soon as it earned anything.

**Content on Hobby may be used for model training,** with an opt-out in team settings. For an app holding children's names, ages, photos, and voice notes, that is the wrong default and conflicts with the constitution's privacy guardrail.

**The architecture fits a server better than serverless.** Ludi is a React front end with a separate Node API, not a Next.js app, and voice transcription, activity tailoring, and story generation are all slow by nature. Serverless timeouts are a real constraint there. A long-running server has none, and the database sits next to the application instead of on another provider's free tier.

The trade-off is accepted: backups, updates, and uptime are ours. For a pre-launch product with a handful of families that is a fair price for zero marginal cost. If operations become a distraction, DigitalOcean's App Platform and managed Postgres are a much shorter move than leaving Vercel would have been.

## System shape

Four containers on one droplet, defined in a single Docker Compose file used in both local development and production: **caddy** (TLS, the built React app as static files, `/api` proxied to the server), **api** (all business logic, database access, and every call to an external service), **db** (PostgreSQL on a mounted volume), and **stt** (a Whisper server for voice notes). A one-shot **migrate** service runs before the API starts.

The rules that hold it together:

- **The browser never talks to an LLM provider, a maps provider, or the database directly.** Everything goes through the API, so keys stay on the server and every AI call can be logged, rate-limited, and bounded by safety rules.
- **The database is not exposed to the public internet.** Only the API reaches it.
- **The same Compose file runs locally,** so there is no drift between a developer machine and the server. Local development runs at `https://ludi.local` rather than `localhost` because microphone capture and service workers need a secure context, and because a real hostname lets a phone on the network load it. In production the same Caddyfile swaps the site address for the real domain.
- **Caddy serves hashed assets `immutable` and everything else `no-cache`,** which is what makes every deploy refresh cleanly on clients.
- **Every deploy ships the web app.** Caddy's image builds it, so the stack never serves a build left over from before a pull.

## Client

A single-page app, shipped as static files. TanStack Router gives per-route code splitting and prefetching on tap, so every screen after the first loads instantly, and no heavy UI library keeps the bundle small.

**Next.js was considered and set aside.** Ludi is a logged-in, phone-first app with no public pages to rank, and every piece of data and logic belongs to the API. Server-side rendering would add a second runtime next to it and buy nothing, while its hydration cost would land on the mid-range phones that matter most. If marketing pages that need SEO ever appear, they can be a tiny separate site.

### Devices

The interface is phone-first and one-handed, since a parent is often holding a toddler. Mobile is not a layout variant; it is the product. [design.md](design.md) covers what that means on screen.

- **Mid-range Android is the floor for every performance decision,** not a fallback. The budget: first screen interactive in under three seconds on a throttled mid-range device (4× CPU slowdown, slow 4G), with under ~150 KB gzipped of JavaScript for the initial route.
- **Chrome on Android and Safari on iOS, both first-class.** iOS Safari is the riskiest target and gets real-device testing early, especially for microphone capture, service workers, and keeping the screen awake. The voice recorder has not yet been checked on a real iPhone (JUG-89).
- **Desktop must not break, but gets no dedicated layouts, features, or testing effort in v1.**

Voice is the primary input, captured in the browser and sent to the API for transcription.

### Offline and the service worker

Play happens in plazas and bedrooms with weak signal, so current suggestions, active goals, and the last story opened stay readable offline. Two hard rules govern how, both born of service worker pain:

**The service worker does not exist in development.** It is generated only by `vite build` and registered only in production builds, so it can never cache a dev server or leave stale caches on a developer machine. It is tested the honest way: a production build served locally.

**Every deploy refreshes cleanly on every client.** The known failure modes, each closed:

- Assets are content-hashed, so each build produces a new precache manifest the new worker can diff.
- Entry points always revalidate. If any HTTP cache can serve a stale worker, the whole system breaks silently; this is the rule that most often goes wrong.
- A tab running yesterday's code may request a lazy chunk the new deploy replaced. The chunk-load error becomes one page reload rather than a broken screen.
- Updates apply themselves and never interrupt (JUG-111). Each deploy's worker takes over on its own and deletes the old caches; the page reloads at the next safe moment, never while a story is read or the timer runs. An earlier banner that asked first let an old version run for as long as nobody tapped it.
- **Offline data is not the service worker's job.** The worker precaches the app shell. Product data lives in a small app-owned store written on every successful fetch and read when the network fails. The worker never caches API responses: that is the origin of most stale-data horror stories, and the app knows better than the worker what may be served stale.
- **A kill switch always exists.** If a bad worker ever ships, the next deploy can ship one that unregisters all previous workers and tears down their caches.

### After version 1: native

After 1.0, Ludi goes native, either React Native or fully native. That is decided now because it shapes v1: the client stays a thin rendering layer, all logic and AI orchestration live in the API so a native client is a port rather than a rebuild, browser-specific investment stops at what v1 needs, and what a native client would reuse — voice capture, the offline store, the API client — is written as isolated modules rather than woven through components.

## Server

A Fastify API organized by product domain. Responsibilities that belong to the server and nowhere else: all database access, all AI calls with each activity template's safety constraints enforced server-side, voice transcription (after which the audio is discarded rather than stored), calls to the weather and maps providers with responses cached, and the holiday calendar.

The shape that makes this testable: routes map URLs to controllers, controllers handle HTTP, services hold the business logic and the queries, and `app.js` builds the app with every dependency passed in, which is what lets integration tests build it against a scratch database. Configuration is read and validated once at startup, and a missing secret stops the process. One error handler gives every failure the same shape and never describes server errors to the client.

Long-running AI work is the main performance concern. Story generation streams to the client, so the parent sees text appear rather than waiting on a blank screen.

## Data

PostgreSQL, because the model is genuinely relational: families, adults, kids, toys, activity templates, goals, tips, stories, and moments, with links between nearly all of them. The core query of the product — activities for a given age, duration, energy level, and location that use toys this family owns — is exactly what SQL handles well. Postgres also offers JSONB for the flexible parts and `pgvector` if semantic matching over the catalog proves useful.

**Drizzle, because it stays close to SQL.** The schema expresses the check constraints and partial indexes the model relies on, raw SQL stays available for what is Postgres-specific, and it needs neither TypeScript nor a code generator. Prisma would have kept check constraints out of its schema, and the class-based ORMs only pay off with TypeScript.

**The schema is only ever changed by migrations,** generated by drizzle-kit and applied by a runner of our own that takes an advisory lock, records what it applied, refuses a migration edited after it ran, and refuses one older than the latest applied. Application code never creates tables, migrations only go forward, and a migration that has run anywhere is never edited.

**Data comes from seeds, never from application code.** Seeds load through Better Auth and the services, the same way the app does, and skip whatever already exists. The catalog seed runs on every deploy and never overwrites a template already in the database, since the database is the catalog's home (JUG-9). The development seed refuses to run in production.

**Published content stays cleanly separated from family data.** The content factory of 0.7 — drafts, review states, versions, reviewer accounts — may one day be more than the app database wants to hold. The answer then is not to stretch PostgreSQL further but to stand up a CMS with its own database that publishes finished content to the app. Keeping that split clean now is what makes the move cheap if it ever comes.

Two rules carry over from the constitution and shape the schema:

- **A toy's family name and its description for the AI are separate fields,** and the AI never derives facts, especially about size or safety, from the family name.
- **Each activity template has a reviewed core the AI cannot alter,** and tailoring slots it fills per family.

The tables themselves, and what each domain owns, are in [api/AGENTS.md](../api/AGENTS.md).

## External services

| Service | Used for | Notes |
|---|---|---|
| LLM provider | Stories, activity tailoring, reading a family from the parent's words | OpenCode Go, OpenRouter, or Claude Code, chosen by environment variable (JUG-115, JUG-168); which to keep is still open. OpenRouter requests refuse upstream providers that store or train on prompts. Claude Code runs the `claude` CLI with a Claude subscription's OAuth token; the API's Docker image installs the CLI. Server-side only. |
| Speech-to-text | Voice notes | Must handle Rioplatense Spanish, children's names, and background noise. Whisper on the droplet by default, so audio never leaves the server; the API speaks the OpenAI transcriptions API, so a hosted service is a change of environment variables (JUG-88). |
| Google | Sign in with Google | Asked only for the `openid`, `email`, and `profile` scopes; Ludi keeps the name and email. Better Auth's Google provider, set by environment variable (JUG-63). |
| Weather | Matching suggestions to conditions | Open-Meteo, which needs no account and no key (JUG-25). Cached per location, keyed by coordinates rounded to about a kilometre, so one call covers a city. It never fails a suggestion: weather that can't be read leaves the ranking as it was. |
| Decision model | Whether the kids playing would enjoy each juego that fits, one factor of the ranking | TypeSafe's Jev (JUG-200), one call per suggestion that answers a yes/no probability for every candidate. It gets the kids' ages and interests and the templates with their slots unfilled, never a name. Off without `TYPESAFE_API_KEY`, and it never fails a suggestion: past 1.5 seconds or on an error the ranking goes without it. TypeSafe says it doesn’t train on requests; how long it keeps them is in its Data Processing Agreement, and zero retention is for enterprise plans. |
| Geocoding | Turning the words a family writes for where they live into coordinates | Open-Meteo's geocoding service, asked only when those words change (JUG-25). A city or a zone, never a home: nothing asks the device where it is. |
| Maps | Nearby plazas and kid-friendly places | Maps data is enough for v1; no curated event listings. |
| Email | Invitations to sign up (JUG-34); email verification when it comes | Resend's free plan over SMTP, 3,000 emails a month and 100 a day. Any SMTP service is a change of environment variables (JUG-169). DigitalOcean blocks SMTP's usual ports on droplets, so it uses 2465. Only the address and the message leave the server. |

Each sits behind a thin internal interface, so a provider can be swapped without touching product code.

## Privacy and security

These follow from the constitution's guardrails. Family data is minimal by default, and children's names, ages, photos, and location get the highest care. Voice recordings are transcribed and discarded. Parents can see, change, and delete everything the app knows. Nothing is sold or shared, and no data is used to advertise to children.

What that means in practice:

- All secrets live in server-side environment variables, never in the client bundle.
- Photos are stored on the droplet's volume, not a third-party service, and served only to the family that owns them.
- Backups are encrypted and stored off the droplet.
- Argentina's Ley 25.326, overseen by the AAIP, is the first legal framework to satisfy. Each new market adds its own.
- What parents send in their own words is kept only for auditing the playtest (JUG-116), only while `AUDIT_TRANSCRIPTS` is on, which is never in production. Deleting an account or family deletes those rows. The texts never go into logs.

## Operations

Deployment is a rebuild and restart of the Compose stack on the droplet, kept simple enough to run from a single command. The minimum for v1: automated nightly database backups stored off the droplet and verified by restoring them at least once, basic uptime and error monitoring, and logs that record AI calls for cost and debugging without storing family data unnecessarily.

Version 1 runs a single environment. Staging is worth adding once families outside Alex's household are using it.

## Open questions

- Which LLM provider to keep, and which model tier for which task. Story generation and activity tailoring have different quality and latency needs.
- Whether the droplet's CPU transcribes fast enough to keep running Whisper itself (JUG-88).
- Whether the content pipeline eventually splits into a separate worker, or a CMS with its own database. The content factory, where agents draft activities and humans review them, may be better as its own process than as part of the user-facing API.
- How the partner invite (0.6) works on top of Better Auth.
- How the holiday calendar is versioned and deployed.
