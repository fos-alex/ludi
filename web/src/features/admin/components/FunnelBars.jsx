/**
 * How far families get, from the account to the first juego (JUG-199). One
 * measure at three stages, so one colour and one scale: what tells the stages
 * apart is how long the bars are and what they say, not a colour each.
 *
 * Every bar is labelled where it is, since there are three of them; a chart
 * with thirty points would say it on hover instead.
 *
 * @param {{ stages: { label: string, value: number }[] }} props the widest first
 */
export function FunnelBars({ stages }) {
  const most = Math.max(1, ...stages.map((stage) => stage.value))
  const [first] = stages

  return (
    <figure className="funnel">
      <figcaption className="chart__title">De la cuenta al primer juego</figcaption>
      <ol className="funnel__list">
        {stages.map((stage) => (
          <li key={stage.label} className="funnel__row">
            <span className="funnel__label">{stage.label}</span>
            <span className="funnel__track">
              <span className="funnel__bar" style={{ width: `${(stage.value / most) * 100}%` }} />
            </span>
            <span className="funnel__value">
              <b>{stage.value}</b>
              {first && first.value > 0 && stage !== first && (
                <span className="funnel__share"> · {Math.round((stage.value / first.value) * 100)}%</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  )
}
