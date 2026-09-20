import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { chainActivity } from '../api'
import { placeText } from '../model'
import { useOnline } from '../../../shared/hooks/useOnline'
import { useStored } from '../../../shared/store'
import { Card, MetaLabel } from '../../../shared/ui'
import '../activities.css'

/**
 * Con lo mismo (JUG-196). Gathering the sheets, the tape and the boxes takes
 * longer than the ten minutes of juego they buy, so once something is on the
 * floor Ludi offers a second juego played with it: one that needs at most one
 * thing more and uses what is already out. It sits under the clock on the
 * reloj, from the moment Empezar starts it, and under the juego's card on
 * Home.
 *
 * The juego is fetched the first time the card comes up for it, so the parent
 * reads a real juego rather than a promise, and it is kept in the store, so
 * the reloj and Home show the same one and going back doesn't ask for
 * another. Nothing shows while it is coming, when the juego needs no
 * materials, or when the catalog has nothing to continue it: this is an
 * offer, never a line saying there is none.
 *
 * A tap opens it like any other juego. It doesn't end the clock still
 * running: its own Empezar takes the timer over, as starting a juego always
 * does.
 * @param {{ activity: import('../types').Activity, className?: string }} props
 */
export function SameMaterials({ activity, className = '' }) {
  const navigate = useNavigate()
  const online = useOnline()
  const chain = useStored('chain')
  const activities = useStored('activities')
  const reusable = (activity.materials?.length ?? 0) > 0
  const next = chain?.from === activity.id && chain.activityId ? activities?.[chain.activityId] : null

  useEffect(() => {
    if (!reusable || !online) return
    chainActivity(activity.id).catch(() => {})
  }, [activity.id, reusable, online])

  if (!reusable || !next) return null

  return (
    <Card className={`same-materials ${className}`.trim()} onClick={() => void navigate({ to: '/idea/$id', params: { id: next.id } })}>
      {/* Voice pass pending: "Con lo mismo". */}
      <MetaLabel as="span" wide tone="primary">
        Con lo mismo
      </MetaLabel>
      <span className="card-title">{next.title}</span>
      <span className="card-meta">
        {next.minutes} min · {placeText(next.place)}
      </span>
    </Card>
  )
}
