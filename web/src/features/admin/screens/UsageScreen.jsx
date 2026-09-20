import { useEffect, useState } from 'react'
import { listUsage } from '../api'
import { AdminNav } from '../components/AdminNav'
import { DailyChart } from '../components/DailyChart'
import { FunnelBars } from '../components/FunnelBars'
import { StatTile } from '../components/StatTile'
import { adminFailure, CHART_DAYS, dayLabel, USAGE_LABELS } from '../model'
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle'
import { Body, Dots, Header, Screen, StatusLine } from '../../../shared/ui'
import '../admin.css'

/** @typedef {import('../types').Usage} Usage */

/**
 * Uso (JUG-199): what families have done with Ludi. The API counts the six
 * events itself (JUG-198), so nothing on this page is measured in a browser
 * and none of it costs a parent anything; the same events also go to GA4,
 * which is for digging around rather than for the numbers here.
 *
 * It is the admin's third page, and like the rest of the admin it has no
 * login yet.
 */
export function UsageScreen() {
  const [usage, setUsage] = useState(/** @type {Usage | null} */ (null))
  const [failure, setFailure] = useState(/** @type {string | null} */ (null))

  useDocumentTitle('Uso · Admin · Ludi')

  useEffect(() => {
    listUsage().then(setUsage, (error) => setFailure(adminFailure(error)))
  }, [])

  const month = usage?.days.slice(-CHART_DAYS) ?? []

  return (
    <Screen className="admin">
      <Header title="Uso" />
      <Body className="page-body">
        <AdminNav />
        <StatusLine role="alert">{failure}</StatusLine>
        {!usage && !failure && <Dots tone="page" />}

        {usage && (
          <>
            <ul className="tiles">
              {USAGE_LABELS.map(([event, label]) => (
                <StatTile key={event} label={label} total={usage.totals[event]} recent={usage.recent[event]} />
              ))}
            </ul>

            <DailyChart
              title="Juegos"
              days={month}
              series={[
                { event: 'juego_shown', label: 'Mostrados' },
                { event: 'juego_played', label: 'Jugados' },
              ]}
            />

            <DailyChart
              title="Cuentos"
              days={month}
              series={[
                { event: 'story_told', label: 'Contados' },
                { event: 'series_started', label: 'Series empezadas' },
              ]}
            />

            <FunnelBars
              stages={[
                { label: 'Crearon la cuenta', value: usage.totals.account_created },
                { label: 'Armaron la familia', value: usage.totals.family_created },
                { label: 'Jugaron al menos una vez', value: usage.familiesPlayed },
              ]}
            />

            <details className="usage-table">
              <summary>Ver los números, día por día</summary>
              <div className="usage-table__scroll">
                <table>
                  <caption>Los últimos {CHART_DAYS} días, uno por fila.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Día</th>
                      {USAGE_LABELS.map(([event, label]) => (
                        <th key={event} scope="col">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...month].reverse().map((day) => (
                      <tr key={day.day}>
                        <th scope="row">{dayLabel(day.day)}</th>
                        {USAGE_LABELS.map(([event]) => (
                          <td key={event}>{day[event]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <StatusLine>
              Los días se cuentan en Buenos Aires, así que un cuento de las once de la noche queda en esa noche. Los mismos
              eventos van a{' '}
              <a href="https://analytics.google.com" target="_blank" rel="noreferrer">
                Google Analytics
              </a>
              , que sirve para revolver; estos números son los de acá y están al día.
            </StatusLine>
          </>
        )}
      </Body>
    </Screen>
  )
}
