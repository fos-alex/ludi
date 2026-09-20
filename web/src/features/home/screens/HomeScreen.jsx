import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AppMenu } from '../../../app/AppMenu'
import { ChoiceChip, ChoiceSheet, placeText, ReactionRow, SameMaterials, suggestActivity, WeatherNote } from '../../activities'
import { choosePlaying, familyLine, loadFamily, markPlaying, WhoPlays } from '../../family'
import { forgetOptions, LastStoryCard, storyOptions } from '../../stories'
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle'
import { useOfflineNotice } from '../../../shared/hooks/useOfflineNotice'
import { useRequest } from '../../../shared/hooks/useRequest'
import { useSerialSaves } from '../../../shared/hooks/useSerialSaves'
import { read, useStored } from '../../../shared/store'
import {
  Footer,
  MenuIcon,
  MetaLabel,
  OfflineNotice,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusLine,
  Waiting,
  Wordmark,
} from '../../../shared/ui'
import { PlayingCard } from '../components/PlayingCard'
import '../home.css'

const SLOW_AFTER_MS = 6000

/** @typedef {import('../../family').Kid} Kid */

/**
 * 2j (2i when there is no last idea yet), with 2l and 2q as its states. The
 * wait happens here: the pressed button holds three slow dots, and the story
 * button greys out so a second tap can't queue another request. Never a feed,
 * streaks, or a nudge about days since last played. With more than one kid,
 * the parent picks who's playing above the buttons (JUG-107). While a juego is
 * played, its card shows the time left and lets the parent end it (JUG-134).
 * The story options are asked for here, quietly, so Hora del cuento opens
 * with them already on screen (JUG-140). The last story read sits under the
 * juego, with the way to make it a series (JUG-154). Inside the last juego's
 * card, the feedback tap asks once how it went (JUG-23): it is there while the
 * juego has no reaction, stays through the tap, and isn't asked again. Under
 * that card, Con lo mismo offers the juego to play next with the materials it
 * needed (JUG-196). Above
 * the button, *¿Algo en especial?* opens the sheet where the parent chooses
 * what the juego should be (JUG-31); before bed it says the next juego will
 * be tranqui (JUG-26). In the top corner, the weather the juego is picked
 * for, with its line on a tap (JUG-191).
 */
export function HomeScreen() {
  const navigate = useNavigate()
  const offline = useOfflineNotice()
  const { online } = offline
  const family = useStored('family')
  const lastId = useStored('lastActivityId')
  const activities = useStored('activities')
  const last = activities?.[lastId]
  const timer = useStored('timer')
  // The juego being played takes the last juego's place: Home shows one card, never two.
  const running = timer ? activities?.[timer.activityId] : null
  // The juego whose materials are out, which Con lo mismo offers a second one for (JUG-196).
  const onTheFloor = running ?? last
  const stories = useStored('stories')
  const lastStoryId = useStored('lastStoryId')
  const lastStory = stories?.[lastStoryId ?? '']
  const request = useRequest({ slowAfter: SLOW_AFTER_MS })
  // Choices are saved one after another, and a juego or a story waits for the last one.
  const saves = useSerialSaves()
  const [menuOpen, setMenuOpen] = useState(false)
  const [choosing, setChoosing] = useState(false)
  // The juego reacted to on this visit, so the chips don't vanish under the tap.
  const [reactedTo] = useState(() => (last && last.reaction == null ? last.id : null))
  const picking = (family?.kids.length ?? 0) > 1

  useDocumentTitle('Ludi')

  useEffect(() => {
    // Who's playing may have changed on another phone.
    if (navigator.onLine) loadFamily().catch(() => {})
  }, [])

  useEffect(() => {
    // The options take a while to write, so they are asked for while the
    // parent is still here. A failure is nothing to say: the story screen
    // asks again and answers for itself.
    if (!navigator.onLine || read('storyOptions')) return
    storyOptions({}).catch(() => {})
  }, [])

  /** @param {Kid} kid */
  const toggle = (kid) => {
    if (!family || request.busy) return
    if (!online) return offline.tap()
    // A family cached before JUG-107 has no kid ids until the refresh above lands.
    if (family.kids.some((each) => !each.id)) return
    const playing = kid.playing !== false
    if (playing && family.kids.filter((each) => each.playing !== false).length === 1) return
    const kids = family.kids.map((each) => (each.id === kid.id ? { ...each, playing: !playing } : each))
    markPlaying(kids)
    // The options on hand star the kids who were playing, so they retire here.
    forgetOptions()
    request.reset()
    const ids = kids.filter((each) => each.playing !== false).map((each) => /** @type {string} */ (each.id))
    saves.add(
      () => choosePlaying(ids),
      (error) => {
        request.fail(error)
        return loadFamily().catch(() => {})
      },
    )
  }

  const suggest = () => {
    if (!online) return offline.tap()
    void request.run(async () => {
      await saves.settled()
      const activity = await suggestActivity({ after: lastId })
      void navigate({ to: '/idea/$id', params: { id: activity.id }, state: { closest: activity.closest } })
    })
  }

  const openStories = async () => {
    setMenuOpen(false)
    if (!online) return offline.tap()
    await saves.settled()
    void navigate({ to: '/cuentos' })
  }

  return (
    <Screen className="home">
      <header className="home__header">
        <div className="home__bar">
          <button
            type="button"
            className="menu-button"
            aria-label="Abrir el menú"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <MenuIcon />
          </button>
          <Wordmark greet />
          <WeatherNote />
        </div>
        {/* With the picker below, the kids are named there instead. */}
        {family && !picking && <p className="home__family">{familyLine(family)}</p>}
      </header>

      {(!online || last || running || lastStory) && (
        <div className="home__memory">
          <OfflineNotice notice={offline} className="home__offline">
            {last || running ? 'Estás sin conexión. El último juego sigue acá.' : 'Estás sin conexión.'}
          </OfflineNotice>
          {running ? (
            <PlayingCard activity={running} timer={timer} />
          ) : (
            last && (
              <div className="card last-juego">
                <button
                  type="button"
                  className="last-juego__open"
                  onClick={() => void navigate({ to: '/idea/$id', params: { id: last.id } })}
                >
                  <MetaLabel as="span" wide>
                    El último juego
                  </MetaLabel>
                  <span className="card-title">{last.title}</span>
                  <span className="card-meta">
                    {last.minutes} min · {placeText(last.place)}
                  </span>
                </button>
                {reactedTo === last.id && <ReactionRow activity={last} className="last-juego__reaction" />}
              </div>
            )
          )}
          {onTheFloor && <SameMaterials activity={onTheFloor} />}
          <LastStoryCard />
        </div>
      )}

      <div className="home__spacer" />

      <Footer className="home__actions">
        {picking && family && <WhoPlays kids={family.kids} onToggle={toggle} />}
        <ChoiceChip open={choosing} onOpen={() => setChoosing(true)} />
        <PrimaryButton
          size="home"
          busy={request.busy}
          busyLabel="Pensando un juego"
          busyMark={<Waiting tone="on-primary" className="home__thinking" />}
          unavailable={!online}
          onClick={suggest}
        >
          ¡Juguemos!
        </PrimaryButton>
        {/* Voice pass pending: the line shown after ~6 s of thinking. */}
        {request.state === 'slow' && <StatusLine role="status">Sigo pensando. Ya casi está.</StatusLine>}
        {request.state === 'error' && <StatusLine role="alert">{request.failure}</StatusLine>}
        <SecondaryButton size="lg" disabled={request.busy} unavailable={!online} onClick={() => void openStories()}>
          Hora del cuento
        </SecondaryButton>
      </Footer>

      <ChoiceSheet
        open={choosing}
        onClose={() => setChoosing(false)}
        onPlay={() => {
          setChoosing(false)
          if (!request.busy) suggest()
        }}
      />
      <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} onStories={() => void openStories()} />
    </Screen>
  )
}
