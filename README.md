# Ludi

*The play coach that knows your family by heart.*

Ludi helps families turn the time they have into play that is fun and meaningful. It knows who is in the family, what each kid loves, which toys are in the house, and what each child is working on learning, and it uses all of that to answer one everyday question: *¿Qué hacemos ahora?*

**Version 1 scope:** Argentina (Buenos Aires first) · ages 1–5 · responsive web

**Stack:** React SPA (Vite) · Fastify · PostgreSQL · Docker Compose on a DigitalOcean droplet

## Documentation

| Document | What it covers |
|---|---|
| [Product concept](docs/product-concept.md) | Vision, market, features, content, and the v1 decisions |
| [Constitution](docs/constitution.md) | The five commitments and the guardrails every decision follows |
| [Architecture](docs/architecture.md) | The technical decisions and why they were made |
| [Design](docs/design.md) | How the app looks, and the rules behind it |
| [Releases](docs/releases.md) | The plan from the 0.1 concept test to the 1.0 launch |
| [AGENTS.md](AGENTS.md) | How agents work in this repo, with a guide each for [web/](web/AGENTS.md) and [api/](api/AGENTS.md) |

## Running it

The stack runs at `https://ludi.local:3000`, the same shape as production: one origin, Caddy in front, `/api` proxied to the API container.

```bash
docker compose up --build
```

`docker compose up` applies pending migrations and loads new catalog templates before the API starts, so a pull needs nothing else. Rebuild (`--build`) only after a dependency changes in `package.json`. `/api/health` reports database connectivity, and `docker compose exec db psql -U ludi` opens a database shell (with the user in your `.env`).

Hot reload is on by default: `.env.example` sets `COMPOSE_FILE=docker-compose.yml:compose.dev.yml`, which mounts `web/` and `api/src` into the containers, so a saved change shows up without a rebuild. The droplet's `.env` leaves `COMPOSE_FILE` out and builds the production web app instead. There is no service worker in development; a browser that installed the production one gets a script that removes it.

### First-time setup

```bash
sudo usermod -aG docker $USER
echo '127.0.0.1 ludi.local' | sudo tee -a /etc/hosts

# Arch/Omarchy shadow .local hosts entries behind mDNS; this puts /etc/hosts first
sudo sed -i 's/^hosts:.*/hosts: files mymachines mdns_minimal [NOTFOUND=return] resolve myhostname dns/' /etc/nsswitch.conf

# A session secret, and the admin, which is where you invite yourself in
cp .env.example .env
sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|; s|^ADMIN_ENABLED=.*|ADMIN_ENABLED=true|" .env

docker compose up --build

# Then open https://ludi.local:3000/admin/usuarios and invite your email. With no
# SMTP settings the page hands you the invitation's link: open it to sign up.

# Trust Caddy's local certificate authority (Arch; Firefox imports it separately)
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.pem | sudo tee /etc/ca-certificates/trust-source/anchors/ludi-local.pem
sudo update-ca-trust
```

Voice notes run Whisper as the `stt` service, its model built into the image: `docker compose up --build` downloads about 500 MB once, and every start after that needs no network access.

### On a phone

Caddy also serves plain HTTP on `127.0.0.1:3001`, and Tailscale Serve puts the tailnet's HTTPS in front of it (443 is taken, so it uses 8443). The phone has to be on the tailnet.

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:3001   # https://<machine>.<tailnet>.ts.net:8443
tailscale serve --https=8443 off                          # stop
```

Add that address to `TRUSTED_ORIGINS` in `.env` and run `docker compose up -d`, or signing in from the phone fails with "Invalid origin".

### On the droplet

Production is `https://ludi.ar`, from the same Compose file. `ludi.ar` has to point at the droplet in DNS, and ports 80 and 443 have to be open, before Caddy can get its certificate. The droplet's `.env` differs from `.env.example` in these lines:

```bash
CADDY_SITES=production                  # ludi.ar with Let's Encrypt, instead of ludi.local and plain HTTP
HTTPS_PORT=443
HTTP_PORT=80
BETTER_AUTH_URL=https://ludi.ar
# COMPOSE_FILE left out: the production web app, no hot reload
```

Its own `BETTER_AUTH_SECRET` and a real `POSTGRES_PASSWORD` too. For Google sign-in, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from [the Google client](#sign-in-with-google). Then `docker compose up -d --build`.

Nobody can sign up there without an invitation, and invitations come from the admin, which has no login yet, so `ADMIN_ENABLED` stays false on the droplet until it has one. Until then the accounts on it are the ones invited before it was turned off.

### Sign in with Google

The API needs an OAuth client from Google. In the [Google Cloud console](https://console.cloud.google.com/auth/overview), in a project for Ludi:

1. **Branding:** the app name (Ludi) and a support email. **Audience:** External. In Testing, only the Google accounts added as test users can sign in, so add the family's.
2. **Clients → Create client → Web application**, with one authorized redirect URI: `https://ludi.ar/api/auth/callback/google`.
3. Put its client ID and secret in the droplet's `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Ludi asks Google only for the name and email. A Google account gets in only if it comes through an invitation for that same email, or it already has an account, which it joins.

**On this machine.** Google sends the browser back to `BETTER_AUTH_URL`, and it refuses `ludi.local` as a redirect URI, since `.local` isn't a public domain. It accepts `localhost` over plain HTTP, and Caddy already serves the stack there on port 3001:

1. Create a second client, *Ludi local*, with the redirect URI `http://localhost:3001/api/auth/callback/google`, so the droplet's secret stays on the droplet.
2. In `.env`, set its `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, set `BETTER_AUTH_URL=http://localhost:3001`, and add `https://ludi.local:3000` to `TRUSTED_ORIGINS`, so email sign-in keeps working there.
3. `docker compose up -d`, open `http://localhost:3001/admin/usuarios`, invite that Google account's email, and open the invitation's link. Tapping *Continuar con Google* there signs it up.

After changing `BETTER_AUTH_URL`, a browser may have to sign in again. While it points at `localhost`, Google sign-in works only at `http://localhost:3001`, not at `ludi.local` or on the phone; put it back when you're done.

### Email

The API sends email through an SMTP service: Resend's free plan to start, with 3,000 emails a month and 100 a day. Nothing sends email yet, and without `SMTP_HOST` it stays off. To set it up:

1. At [resend.com](https://resend.com), add the domain `ludi.ar` in the São Paulo region, and add the DNS records Resend lists wherever `ludi.ar`'s DNS is hosted.
2. Create an API key with sending access only.
3. Add these lines to `.env`, then run `docker compose up -d`:

   ```bash
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=2465                          # DigitalOcean blocks 25, 465, and 587 on droplets
   SMTP_USER=resend
   SMTP_PASSWORD=re_...                    # the API key
   EMAIL_FROM="Ludi <hola@ludi.ar>"
   ```

4. Send a test email: `docker compose exec api node api/src/send-test-email.js you@example.com`, or `npm run email:test -w api -- you@example.com` outside Docker.

### Moving from juguemos.local

The product was called Juguemos until September 2026 (JUG-151). A machine set up before that starts over with a fresh database:

```bash
# Stop the old stack and delete its volumes: the database, Caddy's certificates, and the Whisper model
docker compose -p juguemos down -v

# The new hostname, and the new names in .env
echo '127.0.0.1 ludi.local' | sudo tee -a /etc/hosts
sed -i 's|juguemos.local|ludi.local|g; s|^POSTGRES_USER=.*|POSTGRES_USER=ludi|; s|^POSTGRES_DB=.*|POSTGRES_DB=ludi|' .env

docker compose up -d --build
npm run seed -w api

# Caddy has a new certificate authority: trust it in place of the old one
sudo rm /etc/ca-certificates/trust-source/anchors/juguemos-local.pem
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.pem | sudo tee /etc/ca-certificates/trust-source/anchors/ludi-local.pem
sudo update-ca-trust

# The nightly timer, under its new name
systemctl --user disable --now juguemos-nightly.timer
rm ~/.config/systemd/user/juguemos-nightly.*
cp scripts/ludi-nightly.* ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now ludi-nightly.timer
```

### Demo accounts

`npm run seed -w api` loads the catalog and these accounts, each with a different family. All of them use the password `ludi-local`. They exist only on a development database: the passwords are in the repo, and the seed refuses to run in production.

| Email | Family |
|---|---|
| `prueba@ludi.local` | A toddler and a pet: Milán, 2 years and 2 months, and the dog Inca. Likes dinosaurs and horses, with five named toys. Parents Alex (Papá) and Caro (Mamá), in an apartment |
| `bebe@ludi.local` | A baby and no pet: Olivia, 8 months. Likes songs and water, with two toys |
| `hermanos@ludi.local` | Two kids far apart in age: Tomás, 8 years and 2 months, and Emma, 4 years and 4 months, and the cat Michi. A house with a garden, and no parents saved |
| `cinco@ludi.local` | One kid of five: Lola, 5 years and 4 months, who likes birds and music, with three toys and no pet. The only family old enough for the juegos from age 5, like ¿Qué suena? Pájaros del barrio |

### Admin

`/admin` manages the activity templates: add, edit, switch off, and delete. `/admin/usuarios` lists the accounts, removes one with *Borrar*, and invites an email, which is the only way to create one: the email gets a link to `/invitacion` on `BETTER_AUTH_URL`, where it signs up with a password or Google. With no SMTP settings nothing is sent and the page hands you the link instead. *Borrar* removes an account with its family and everything under it, so the same email can be invited and sign up again, which is how sign-up is tested (JUG-175). The admin has no login yet, so the API serves it only when `.env` has `ADMIN_ENABLED=true`. Never turn it on where anyone outside the family can reach it.

### Emails

Every email Ludi sends is the same branded message: the wordmark, a heading, a few paragraphs, a button, and a quiet line. It is built from `api/src/email/templates/message.mjml` with [MJML](https://mjml.io), whose partials hold the brand.

```bash
npm run email:build -w api                      # compile the MJML to the HTML the API sends; commit both
npm run email:preview -w api > /tmp/ludi.html   # look at an email in a browser
npm run email:test -w api -- you@example.com    # send it to yourself, with a link that leads nowhere
```

## Nightly cleanup

`scripts/nightly-cleanup.sh` runs at 03:00 through the `ludi-nightly` systemd user timer. It removes worktrees whose PR has been merged or closed, along with their branches, and moves Linear issues whose work has landed to Done. It leaves alone anything with uncommitted or unpushed work, and reports it instead.

It closes an issue only when the work was its own: an issue ID in a merged PR's branch name, or the one ID in a commit pushed to `main`. An ID that appears only in a PR title, or beside other IDs in a commit, is a mention, and is reported rather than changed. It looks back three days, and `~/.local/state/ludi/nightly-settled.txt` lists the issues it has already dealt with, so it never asks about the same one twice. Delete a line to have it look at that issue again.

```bash
cat ~/.local/state/ludi/nightly.log          # what it did; LEFT FOR ALEX marks what needs you
./scripts/nightly-cleanup.sh --dry-run --stdout  # what it would do right now
```

To install it, copy `scripts/ludi-nightly.service` and `scripts/ludi-nightly.timer` into `~/.config/systemd/user/`, then `systemctl --user daemon-reload && systemctl --user enable --now ludi-nightly.timer`. The Linear half shells out to Claude Code with Haiku, since the Linear MCP signs in with OAuth and the script has no key of its own.

## Status

Every 0.1 screen is built and runs on the API: accounts with a required session, the family profile, the toy box, activities and stories from templates in the database, and voice notes on *Contame de tu familia*. Reading the family from the parent's own words and bespoke stories use the LLM set in `.env`; without a key, first run starts at the family form and stories come from templates.

Still missing: email verification. The API can send email (JUG-169), but nothing sends any yet.

Next: Alex reviews the first templates, and the catalog grows to 30–40 activities (JUG-14).

## License

© 2026 Alex Otero

Ludi is free software under the [GNU Affero General Public License, version 3](LICENSE) (`AGPL-3.0-only`). Anyone may use, copy, change, and share it under that license. Anyone who changes it and runs it for other people must offer those people the source code of their version. It comes with no warranty.

These terms are added under section 7 of the license:

1. **Credit, under 7(b).** Every copy and every modified version must keep the notice "© 2026 Alex Otero" and a link to the original source, <https://github.com/fos-alex/juguemos>, in its source code and in the Appropriate Legal Notices its user interface displays. In Ludi those notices are in Ajustes, under *Sobre Ludi*.
2. **Modified versions are marked, under 7(c).** A modified version must say that it has been modified, and must not present itself as the original.
3. **The name, under 7(e).** The license grants no rights to the name Ludi, its wordmark, or its app icon as trademarks. A modified version that is shared or run for others uses its own name and icon. It may say that it is based on Ludi.

**The recordings aren't Ludi's.** The sounds in `api/sounds/`, which *¿Qué suena?* plays, are other people's recordings under their own licenses: CC0, Creative Commons Attribution, Attribution-NonCommercial, and the ShareAlike versions of those. `api/sounds/credits.json` names the author, the source, and the license of each one, and the game credits the author on screen when the license asks for it. They are not under the AGPL. A version that is sold can't use the NonCommercial ones, and every clip here is trimmed, so a ShareAlike recording's clip carries that same license (JUG-178, JUG-179 to JUG-185).
