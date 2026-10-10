import { PET_KINDS } from '../model'
import { FieldGroup } from '../../../shared/ui'

/** @typedef {import('../types').PetKind} PetKind */

/**
 * The pet in the family form: one control, with the animal picker and the
 * name inside the same box (JUG-21). The picker shows the animal's emoji
 * alone; its word is the option's accessible name, so a screen reader still
 * says "Perro". A dog until the family says otherwise.
 * @param {{ name: string, kind: PetKind, onName: (name: string) => void, onKind: (kind: PetKind) => void }} props
 */
export function PetField({ name, kind, onName, onKind }) {
  return (
    <FieldGroup label="Mascota">
      <div className="field__control pet">
        <div className="pet__kind">
          <select
            className="pet__kind-select"
            aria-label="Qué animal es"
            value={kind}
            onChange={(event) => onKind(/** @type {PetKind} */ (event.target.value))}
          >
            {PET_KINDS.map((each) => (
              <option key={each.key} value={each.key} aria-label={each.label}>
                {each.emoji}
              </option>
            ))}
          </select>
        </div>
        <input
          className="field__input pet__name"
          aria-label="Nombre de la mascota"
          data-field="pet"
          autoCapitalize="words"
          autoCorrect="off"
          maxLength={80}
          value={name}
          onChange={(event) => onName(event.target.value)}
        />
      </div>
    </FieldGroup>
  )
}
