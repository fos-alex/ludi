import { Navigate, useNavigate, useParams } from '@tanstack/react-router'
import { playingNames } from '../../family'
import { stopTimer } from '../api'
import { SameMaterials } from '../components/SameMaterials'
import { placeText } from '../model'
import { clockText } from '../../../shared/format'
import { useCountdown } from '../../../shared/hooks/useCountdown'
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle'
import { useGoBack } from '../../../shared/hooks/useGoBack'
import { useStored } from '../../../shared/store'
import { Body, Footer, Header, MetaLabel, PetalFall, Screen, SecondaryButton, TertiaryButton } from '../../../shared/ui'
import '../activities.css'

/**
 * 2o. The timer exists to get the phone out of the parent's hand. It counts
 * down from the activity's own estimate as a hint, not a target, and is
 * silent at zero: jacarandá petals come down once, and that is all
 * (JUG-159). The app never logs or reports how long they played.
 *
 * Under the clock, Con lo mismo (JUG-196): the juego to play next with what
 * this one needed, so the fifteen minutes of gathering buy more than one
 * game. It is there from the start, and a juego that needs nothing has none.
 * Copy on this screen needs a voice pass.
 */
export function TimerScreen() {
  const { id } = useParams({ from: '/idea/$id/reloj' })
  const navigate = useNavigate()
  const goBack = useGoBack('/idea/$id', { id })
  const activity = useStored('activities')?.[id]
  // The kids playing on this device (JUG-107), for the hint (JUG-141).
  const names = playingNames(useStored('family'))
  const timer = useStored('timer')
  const mine = timer?.activityId === id
  const remaining = useCountdown(mine ? timer.endsAt : null)

  useDocumentTitle(activity && `${clockText(remaining)} · ${activity.title}`)

  if (!activity || !mine) return <Navigate to="/idea/$id" params={{ id }} replace />

  const finish = async () => {
    await navigate({ to: '/', replace: true })
    stopTimer()
  }

  return (
    <Screen tone="accent">
      <Header
        onBack={goBack}
        trailing={
          <MetaLabel tone="grass">
            {activity.minutes} min · {placeText(activity.place)}
          </MetaLabel>
        }
      />
      <Body className="timer">
        <p className="timer__title">{activity.title}</p>
        {remaining === 0 && <PetalFall />}
        <p
          className={`timer__clock${remaining === 0 ? ' timer__clock--done' : ''}`}
          role="timer"
          aria-label={`Quedan ${clockText(remaining)}`}
        >
          {clockText(remaining)}
        </p>
        <p className="timer__hint">
          Dejá el teléfono y {names ? `disfrutá jugar con ${names}` : 'disfrutá el juego'}.
          <br />
          El reloj sigue solo.
        </p>
        <SameMaterials activity={activity} className="timer__same" />
      </Body>
      <Footer>
        <SecondaryButton size="lg" outline="primary" onClick={goBack}>
          Ocultar el reloj
        </SecondaryButton>
        <TertiaryButton onClick={finish}>Terminamos</TertiaryButton>
      </Footer>
    </Screen>
  )
}
