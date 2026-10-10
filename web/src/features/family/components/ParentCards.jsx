import { blankParent } from '../model'
import { AS_TYPED, Card, Field, FieldGroup, TertiaryButton } from '../../../shared/ui'

/** @typedef {import('../types').Parent} Parent */

/**
 * The parents in the family form (JUG-21), a card each: the name, and what
 * the kids call them, which starts as "Mamá". Both are optional, and a card
 * left without a name isn't saved. Every card can be removed while there is
 * more than one.
 * @param {{ parents: Parent[], onChange: (change: (parents: Parent[]) => Parent[]) => void }} props
 */
export function ParentCards({ parents, onChange }) {
  /** @param {number} index @param {Partial<Parent>} patch */
  const edit = (index, patch) => onChange((all) => all.map((each, i) => (i === index ? { ...each, ...patch } : each)))

  return (
    // Voice pass pending: "Padres", "Nombre", "Le dicen", "Quitar", and "+ agregar otro".
    <FieldGroup label="Adultos">
      <div className="parent-cards">
        {parents.map((parent, index) => {
          const name = parent.name.trim()
          return (
            <Card key={index} className="parent-card">
              <Field
                label="Nombre"
                data-field={`parents.${index}`}
                autoCapitalize="words"
                autoCorrect="off"
                maxLength={80}
                value={parent.name}
                onChange={(event) => edit(index, { name: event.target.value })}
              />
              <Field
                label="Le decimos"
                {...AS_TYPED}
                autoCapitalize="words"
                maxLength={40}
                value={parent.calledAs}
                onChange={(event) => edit(index, { calledAs: event.target.value })}
              />
              {parents.length > 1 && (
                <TertiaryButton
                  size="inline"
                  className="parent-card__remove"
                  onClick={() => onChange((all) => all.filter((_, i) => i !== index))}
                >
                  {name ? `Quitar a ${name}` : 'Quitar'}
                </TertiaryButton>
              )}
            </Card>
          )
        })}
      </div>
      <button type="button" className="add-link" onClick={() => onChange((all) => [...all, blankParent()])}>
        + agregar otro
      </button>
    </FieldGroup>
  )
}
