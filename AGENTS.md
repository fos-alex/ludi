# Working on Ludi

Rules for any agent working in this repo. Claude Code reads this through `CLAUDE.md`, and opencode reads it directly. Each project has its own guide as well, so read the one for the code you are changing:

| Guide | Covers |
|---|---|
| [web/AGENTS.md](web/AGENTS.md) | The React SPA: routes, components, local state, night mode, and the design rules that live in the code |
| [api/AGENTS.md](api/AGENTS.md) | The Fastify API: layers, auth and the sign-up allowlist, migrations, seeds, and tests |

## The project

Ludi is a play coach for families in Buenos Aires. **A task's Linear issue is its spec,** so start there. Read these documents only when the task needs them:

| Document | Read it when |
|---|---|
| [docs/constitution.md](docs/constitution.md) | A change affects what Ludi says to a family, what it asks of them, or what it does with their data. It holds the commitments and guardrails every decision follows |
| [docs/design.md](docs/design.md) | A change touches the UI: colour, type, iconography, motion, or the app icon |
| [docs/architecture.md](docs/architecture.md) | A change adds a service or a dependency, or changes how the pieces run and connect |
| [docs/juego-ranking.md](docs/juego-ranking.md) | A change touches which juego is offered: the filters, a factor of the score, or its weights |
| [docs/product-concept.md](docs/product-concept.md) | You need the reason behind a feature, or you are writing a feature spec |
| [docs/brand-brief.md](docs/brand-brief.md) | The work touches the brand: the name, the voice, or the look |
| [docs/releases.md](docs/releases.md) | You are planning future releases or prioritizing features. A task doesn't need it |

## Product rules

**No outside testers until the guardrails are complete.**

**Start simple.** Build what the issue asks for and nothing more. Don't pull in features from the product concept or parked ideas without asking. A new task goes in Linear as an issue, not in `docs/releases.md`.

## The repo

An npm workspace with two projects, run locally by Docker Compose behind Caddy. The [README](README.md) says how to run the stack and reach it from a computer, a phone, or the droplet.

| Path | What it is |
|---|---|
| `web/` | The React SPA |
| `api/` | The Fastify API and its PostgreSQL migrations |
| `caddy/` | Caddy's image, which builds the web app, and the Caddyfiles, which serve it and proxy `/api` to the API |
| `docker-compose.yml` | Postgres, the one-shot migrations, speech-to-text, the API, and Caddy. `compose.dev.yml` adds hot reload |
| `scripts/` | The nightly cleanup, run by a timer. See [the README](README.md#nightly-cleanup) |
| `docs/` | Product, architecture, design, brand, and releases |

**JSDoc guides, nothing enforces it.** Both projects are plain JavaScript. JSDoc types are there so agents and readers can follow the data; there is no TypeScript, no typecheck, and no `.ts` file, and that is Alex's choice (JUG-70). Keep JSDoc accurate when you change a shape, but don't add a typechecker or a `tsconfig` or `jsconfig`.

**The code is AGPL-3.0-only,** with added terms in the [README](README.md#license) (JUG-171). A new dependency needs a license AGPL-3.0 can include: MIT, ISC, BSD, Apache 2.0, LGPL, GPL-3.0, or AGPL-3.0 work, and GPL-2.0-only or a proprietary license doesn't. Ask Alex before adding one that isn't on that list.

## Writing

**No mannered prose.** Code comments, docs, commit messages, PR descriptions, and Linear are written plainly: say what something does or why, in ordinary words. No literary turns, aphorisms, personification, or clever phrasing.

**Docs carry no version.** Git is the history of every markdown file. Don't add a version, date, or owner line to a document, or a change log section, and don't bump one when you edit a doc. Every edit changed those lines, so agents working at the same time conflicted on them.

## Tracking work in Linear

Linear must always show what is being built and what has finished.

- **Workspace:** Juguemos, team **Juguemos**, issue keys `JUG-…`. Linear and the GitHub repo (`fos-alex/juguemos`) keep the old name; the product is Ludi
- **Projects:** one per release (`0.1 — ¿Me gusta?` through `1.0 — Juguemos`), plus `Later` for work after 1.0 and parked ideas
- **Labels:** Feature, Content, Infrastructure, Decision, Guardrails, Improvement, Bug
- **Statuses:** Backlog → Todo → In Progress → In Review → Done, plus Canceled and Duplicate

Agents reach Linear through its MCP server. Use its tools to find, create, update, and comment on issues directly; don't ask Alex to do in Linear what the MCP can do.

**Linear and GitHub are integrated.** Linear links a branch, PR, or commit to an issue when its name, title, or message contains the issue ID (`JUG-12`). A few seconds after a PR is opened, the integration moves its issue to **In Progress**, and when the PR is merged, to **Done**. It never moves an issue to **In Review**; that is your job.

**Be succinct in Linear.** Linear is for status and for seeing which tasks need Alex's input. It isn't a work log: nobody reads long reports, and writing them wastes tokens. Keep comments to a sentence or two, and task descriptions to a few lines. Write a fuller comment only when another agent will pick the task up later and needs the context to continue.

**Feature issues are specs.** A feature's description is what an agent builds from, so it says what to build, not how: what the feature is, how it behaves, the rules it must keep, what's out of scope, and when it's done. When a feature needs more than one PR, split it into sub-issues an agent can finish in one PR each, and link them with blocking relations. When a decision changes a feature, update its spec.

Every task has a Linear issue:

1. **Starting a task.** Find its issue. If there isn't one, create it in the right release project with a clear title and a short description. Move it to **In Progress** and assign it to Alex.
2. **While working.** Comment only for a question for Alex, a blocker, or a decision Alex should know about. Say plainly what you need from them.
3. **Ready for review.** Every finished task ends in **In Review**. Your work isn't finished until the issue says so.
   - **A PR:** open the PR first. Read the issue until the PR appears in its attachments, then move it to **In Review**. Read it again to check that the status stayed, and set it again if it went back. If you set In Review before the PR is open, or in the seconds after, the integration moves it back to In Progress and it stays there until the merge.
   - **Uncommitted changes:** move the issue to **In Review** and comment with the commit message you suggest.
   - Comment otherwise only if something needs Alex: a decision, or something to try.
4. **Finished.** Merging a PR moves its issue to **Done**. Uncommitted changes move to **Done** once Alex has committed them, through the nightly cleanup, which finds the issue ID in the commit message.

Don't cancel issues, move them between releases, or change a release's scope without asking Alex. When Alex changes a release's scope, update `docs/releases.md` and Linear together so they stay in sync.

## Git

We work on `main`, and every PR targets `main`.

**No `Co-Authored-By` trailers.** Don't add `Co-Authored-By` lines, or any other agent attribution, to commit messages, including the ones you suggest to Alex.

**Small changes stay uncommitted.** If the change is small, leave it uncommitted in the main checkout. Alex reviews and commits it. Suggest a commit message that includes the issue ID, so Linear links the commit and the issue can be closed.

**Big changes get a worktree and a PR.** Use a worktree and a pull request when a change is big, is a separate feature, or is a distinct workstream.

- Name the branch after the Linear issue's branch name (for example `fosalex/jug-12-family-onboarding`). The integration uses it to link the PR to the issue.
- Create the worktree next to the repo, not inside it:
  ```bash
  git fetch origin
  git worktree add ../juegar-worktrees/jug-12-family-onboarding -b fosalex/jug-12-family-onboarding origin/main
  ```
- Push the branch and open the PR with `gh pr create --base main`, with the issue ID in its title. Then move the issue to **In Review** as step 3 above says.

**Alex merges PRs.** Never merge a PR unless Alex has explicitly authorized that specific merge.

**Don't clean up after merged work.** A nightly job removes worktrees whose PR was merged or closed, and moves issues whose work landed to Done ([README](README.md#nightly-cleanup)). Don't do either by hand.
