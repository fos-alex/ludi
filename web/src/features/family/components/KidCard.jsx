import { InterestChips } from './InterestChips'
import { Card, FieldControl, TertiaryButton } from '../../../shared/ui'

/** @typedef {import('../model').FormState['kids'][number]} FormKid */

/**
 * One kid in the family form, with everything about them in one card: the
 * name, the years and the months, and what they love (JUG-152). Being one is
 * very different from being one and ten months, so the months are asked for
 * and shown, even when they are zero (JUG-145). Ages keep only digits.
 *
 * The interest being typed belongs to the form, so saving includes it.
 * `onRemove` takes the kid off the form, which the family loses only on
 * "Guardar"; without it the card has no way to remove the kid.
 * @param {{
 *   kid: FormKid,
 *   index: number,
 *   draft: string | null,
 *   onDraft: (draft: string | null) => void,
 *   onChange: (change: (kid: FormKid) => FormKid) => void,
 *   onRemove?: () => void,
 * }} props
 */
export function KidCard({ kid, index, draft, onDraft, onChange, onRemove }) {
  const name = kid.name.trim()

  /** @param {Partial<FormKid>} patch */
  const edit = (patch) => onChange((current) => ({ ...current, ...patch }))

  const commitInterest = () => {
    const value = draft?.trim()
    if (value) onChange((current) => ({ ...current, interests: [...current.interests, value] }))
    onDraft(null)
  }

  return (
    <Card className="kid-card">
      <div className="kid-row">
        <FieldControl
          className="kid-row__name"
          aria-label={`Nombre ${index + 1}`}
          data-field={`kids.${index}`}
          autoCapitalize="words"
          autoCorrect="off"
          maxLength={80}
          value={kid.name}
          onChange={(event) => edit({ name: event.target.value })}
        />
        <FieldControl
          className="kid-row__age"
          aria-label={`Edad ${index + 1}, en años`}
          inputMode="numeric"
          maxLength={2}
          suffix={kid.years === '1' ? 'año' : 'años'}
          value={kid.years}
          onChange={(event) => edit({ years: event.target.value.replace(/\D/g, '') })}
        />
        <FieldControl
          className="kid-row__age"
          aria-label={`Edad ${index + 1}, meses`}
          inputMode="numeric"
          maxLength={2}
          suffix={kid.months === '1' ? 'mes' : 'meses'}
          value={kid.months}
          onChange={(event) => edit({ months: event.target.value.replace(/\D/g, '') })}
        />
      </div>
      <InterestChips
        name={name}
        field={`interests.${index}`}
        interests={kid.interests}
        draft={draft}
        onDraft={onDraft}
        onCommit={commitInterest}
        onRemove={(position) => onChange((current) => ({ ...current, interests: current.interests.filter((_, i) => i !== position) }))}
      />
      {onRemove && (
        // Voice pass pending.
        <TertiaryButton size="inline" className="kid-card__remove" onClick={onRemove}>
          {name ? `Quitar a ${name}` : 'Quitar'}
        </TertiaryButton>
      )}
    </Card>
  )
}
