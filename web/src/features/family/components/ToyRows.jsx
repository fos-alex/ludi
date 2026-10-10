import { AS_TYPED, FieldControl, FieldGroup } from '../../../shared/ui'

/** @typedef {import('../types').FamilyToy} FamilyToy */

/**
 * The toys by the family's own names, one field each and kept as typed, and a
 * link for one more. Each row keeps its toy's id.
 * @param {{ toys: FamilyToy[], onChange: (change: (toys: FamilyToy[]) => FamilyToy[]) => void }} props
 */
export function ToyRows({ toys, onChange }) {
  return (
    <FieldGroup label="Juguetes · como los llaman en casa">
      <div className="toy-rows">
        {toys.map((toy, index) => (
          <FieldControl
            key={index}
            aria-label={`Juguete ${index + 1}`}
            data-field={index === 0 ? 'toys' : undefined}
            {...AS_TYPED}
            maxLength={120}
            value={toy.name}
            onChange={(event) => {
              const name = event.target.value
              onChange((all) => all.map((each, i) => (i === index ? { ...each, name } : each)))
            }}
          />
        ))}
      </div>
      <button type="button" className="add-link" onClick={() => onChange((all) => [...all, { name: '' }])}>
        + agregar juguete
      </button>
    </FieldGroup>
  )
}
