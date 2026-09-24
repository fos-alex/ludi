import { useRef, useState } from 'react'
import { chartGeometry, dayAt, dayLabel } from '../model'

/** @typedef {import('../types').DayCounts} DayCounts */
/** @typedef {import('../types').UsageEvent} UsageEvent */

/**
 * The SVG's own units. It is stretched to whatever box it gets, so these are
 * only proportions: the lines keep their real width through
 * `vector-effect`, and everything round — the marks, the crosshair — is drawn
 * in HTML over the plot instead, where stretching can't turn a circle into an
 * egg.
 */
const BOX = { width: 600, height: 150 }

/** Where a point sits in the plot, as a percentage of it. @param {number} value @param {number} of */
const percent = (value, of) => `${(value / of) * 100}%`

/**
 * A line a day for each event, over the last month (JUG-199). Two lines at
 * most, both counting the same thing — events in a day — so they share one
 * axis; a second scale on one chart would make the shapes lie.
 *
 * Moving across it reads out the day under the pointer, which is how a reader
 * gets an exact number without a label on all thirty points. Arrow keys walk
 * it, and the same numbers are in the table at the foot of the page.
 *
 * @param {{
 *   title: string,
 *   days: DayCounts[],
 *   series: { event: UsageEvent, label: string }[],
 * }} props
 */
export function DailyChart({ title, days, series }) {
  const [over, setOver] = useState(/** @type {number | null} */ (null))
  const plot = useRef(/** @type {HTMLDivElement | null} */ (null))

  const { max, grid, lines, xOf, yOf } = chartGeometry(
    days,
    series.map((each) => each.event),
    BOX,
  )

  /** @param {React.PointerEvent} event */
  const track = (event) => {
    const box = plot.current?.getBoundingClientRect()
    if (box) setOver(dayAt((event.clientX - box.left) / box.width, days.length))
  }

  /** @param {React.KeyboardEvent} event */
  const step = (event) => {
    const by = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (!by) return
    event.preventDefault()
    setOver((current) => Math.min(days.length - 1, Math.max(0, (current ?? days.length - 1) + by)))
  }

  const day = over === null ? null : days[over]
  const today = days.at(-1)
  // The read-out sits after the day it reads, and flips to the other side past
  // the middle so it never hangs off the chart.
  const atEnd = over !== null && over > days.length / 2

  return (
    <figure className="chart">
      <figcaption className="chart__head">
        <h2 className="chart__title">{title}</h2>
        <ul className="chart__legend">
          {series.map((each, index) => (
            <li key={each.event} className="chart__key">
              <span className="chart__swatch" data-series={index + 1} />
              {each.label}
            </li>
          ))}
        </ul>
      </figcaption>

      <div
        className="chart__plot"
        ref={plot}
        role="img"
        tabIndex={0}
        aria-label={`${title}, los últimos ${days.length} días. Hoy: ${series
          .map((each) => `${each.label}, ${today?.[each.event] ?? 0}`)
          .join('; ')}. Todos los números están en la tabla al pie.`}
        onPointerMove={track}
        onPointerLeave={() => setOver(null)}
        onFocus={() => setOver(days.length - 1)}
        onBlur={() => setOver(null)}
        onKeyDown={step}
      >
        <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} preserveAspectRatio="none" aria-hidden="true">
          {grid.map((line) => (
            <line
              key={line.value}
              x1="4"
              x2={BOX.width - 4}
              y1={line.y}
              y2={line.y}
              className="chart__grid"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {lines.map((line, index) => (
            <polyline
              key={line.event}
              points={line.points}
              className="chart__line"
              data-series={index + 1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        <span className="chart__max">{max}</span>

        {over !== null && <span className="chart__crosshair" style={{ left: percent(xOf(over), BOX.width) }} />}
        {day &&
          series.map((each, index) => (
            // A ring of the card's own colour, so two marks that land on each
            // other still read as two.
            <span
              key={each.event}
              className="chart__dot"
              data-series={index + 1}
              style={{ left: percent(xOf(/** @type {number} */ (over)), BOX.width), top: percent(yOf(day[each.event]), BOX.height) }}
            />
          ))}

        {day && (
          <div className="chart__readout" data-at-end={atEnd || undefined} style={{ left: percent(xOf(over ?? 0), BOX.width) }}>
            <span className="chart__readout-day">{dayLabel(day.day)}</span>
            {series.map((each, index) => (
              <span key={each.event} className="chart__readout-value">
                <span className="chart__swatch" data-series={index + 1} />
                {each.label} <b>{day[each.event]}</b>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="chart__axis">
        <span>{dayLabel(days[0]?.day ?? '')}</span>
        <span>{dayLabel(today?.day ?? '')}</span>
      </div>
    </figure>
  )
}
