/**
 * One number, since the beginning, with the last week under it (JUG-199).
 * There is no chart in a tile: the job is to read one figure, and a shape
 * beside it would only be decoration.
 * @param {{ label: string, total: number, recent: number }} props
 */
export function StatTile({ label, total, recent }) {
  return (
    <li className="tile">
      <span className="tile__label">{label}</span>
      <strong className="tile__total">{total}</strong>
      <span className="tile__recent">{recent === 0 ? 'nada esta semana' : `+${recent} esta semana`}</span>
    </li>
  )
}
