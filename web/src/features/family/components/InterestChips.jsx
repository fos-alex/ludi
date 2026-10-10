import { interestMark } from '../model'
import { ChipInput, Chips, FieldGroup, MarkIcon } from '../../../shared/ui'

/**
 * What one kid loves, as chips (JUG-144), on that kid's card: a tap removes
 * one, and the + chip adds one as typed. `field` is where a flagged row of
 * the card opens the form. `name` is the kid's, for the screen reader, since
 * every card says "Le encanta". An interest with a mark shows it (JUG-160).
 * @param {{
 *   name: string,
 *   field: string,
 *   interests: string[],
 *   draft: string | null,
 *   onDraft: (draft: string | null) => void,
 *   onCommit: () => void,
 *   onRemove: (index: number) => void,
 * }} props
 */
export function InterestChips({ name, field, interests, draft, onDraft, onCommit, onRemove }) {
  return (
    <FieldGroup label="Le encanta" className="kid-card__interests">
      <Chips items={interests} onRemove={onRemove} lead={chipMark}>
        <ChipInput
          value={draft}
          onChange={onDraft}
          onCommit={onCommit}
          field={field}
          maxLength={80}
          addLabel={name ? `Agregar algo que le encanta a ${name}` : 'Agregar algo que le encanta'}
          inputLabel={name ? `Algo que le encanta a ${name}` : 'Algo que le encanta'}
        />
      </Chips>
    </FieldGroup>
  )
}

/** @param {string} interest */
function chipMark(interest) {
  const mark = interestMark(interest)
  return mark && <MarkIcon mark={mark} size={17} className="chip__mark" />
}
