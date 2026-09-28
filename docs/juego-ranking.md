# How a juego is picked

What happens when a parent taps *¡Juguemos!* or *Otro juego*: which juegos can come up, how each one is scored, and why the result varies from tap to tap. The code is `api/src/activities/ranking.js`, and its weights are `DEFAULT_WEIGHTS` there. When they change, update this page too.

## 1. Filter

Before anything is scored, the juegos that can't be played are left out:

- **Age.** The juego's age range has to cover every kid playing.
- **Slots.** The family has to be able to fill every slot the juego uses, such as `{toy}` or `{pet}`.
- **Materials.** The family has to have everything the juego can't be played without (JUG-153).
- **What the parent chose.** Inside or outside, with sound or without, and the kind of play (JUG-31). If nothing matches all of it, the juegos that match the most are kept.
- **Con lo mismo.** When the parent asks for another juego with the same materials, only those juegos are kept (JUG-196).

Two more are left out unless nothing else is left:

- **The juego on screen,** when the parent taps *Otro juego*.
- **Any juego the family last gave a thumbs down.**

## 2. Score

Each juego left gets a score, and the highest one is offered:

**score = fit × feedback × freshness × difference × moment × weather × Jev**

| Factor | In simple terms | Range |
|---|---|---|
| **Fit** | Starts at 1. It gets +1 if the juego is about something the kids love, +0.3 if it names one of their interests, and +0.3 if it uses a favorite toy. | 1 to 2.6 |
| **Feedback** | A random draw shaped by thumbs up and down. The family's own count in full, other families' at half, and reactions to similar juegos by how similar they are. It starts from the juego's rating in the admin (1 to 5). | 0 to 2, about 1 for a juego rated 3 that nobody has judged |
| **Freshness** | A juego seen lately waits before it comes back: most of the way back after about 4 days, or about 10 if the family played it. Once any discovery game, such as ¿Qué suena?, is offered, every discovery game waits about 2 days. | 0.05 to 1 |
| **Difference** | On *Otro juego*, juegos like the one being left lose up to 80%, by how similar they are. | 0.2 to 1 |
| **Moment** | In the evening (calm), energetic juegos keep 15% and medium ones 50%. During the day (lively), quiet juegos keep 25% and medium ones 60%. | 0.15 to 1 |
| **Weather** | Rain, heat, cold, wind, or night: juegos outside keep 15%. A fine afternoon: juegos inside keep 50%. | 0.15 to 1 |
| **Jev** | 1 + 0.5 × (2 × Jev's probability − 1). A probability of 0.5 changes nothing, a sure yes gives ×1.5, and a sure no gives ×0.5. It is 1 when Jev is off or fails (JUG-200). | 0.5 to 1.5 |

## 3. What this means

- **The factors multiply,** so no single one decides. Each moves a juego up or down.
- **None reaches zero,** so every juego that passed the filter can still come up. An energetic juego is still offered at night when it is the only one that fits.
- **The feedback draw is what gives variety.** Two taps in the same moment can give different juegos, and the best-rated ones come up more often without coming up every time.
- **Jev nudges.** All else equal, a juego Jev is sure about is at most three times as likely to win as one it is sure against (1.5 against 0.5). Thumbs, bedtime, and the weather can move a juego much further.

## 4. Reading a pick back

- **Why a juego won.** Every suggestion keeps why it won in `activities.pick`: each factor, the weights, what the parent chose, and Jev's probability (`jev`).
- **How Jev rated every juego.** Each call to Jev is in `jev_calls`, tied to its suggestion, and what Jev gave each juego in that call is in `jev_ratings`.
