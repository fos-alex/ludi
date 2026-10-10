import { SLOT_LIST } from '../model'
import { TextArea } from './TemplateInputs'
import { Label } from '../../../shared/ui'

/** @typedef {import('../model').FormState} FormState */
/** @typedef {import('../model').Errors} Errors */

/**
 * "Lo que lee la familia": the texts the family reads, with their slots
 * unfilled. Steps go one per line.
 * @param {{ form: FormState, errors: Errors, update: (change: Partial<FormState>) => void }} props
 */
export function TextsSection({ form, errors, update }) {
  return (
    <>
      <Label>Lo que lee la familia</Label>
      <p className="field__help">
        Espacios: {SLOT_LIST}. Un juguete es solo un nombre: nada concuerda en género con un espacio.
      </p>
      <TextArea label="Por qué ahora" maxLength={600} error={errors.why} value={form.why} onChange={(why) => update({ why })} />
      <TextArea
        label="Qué necesitás"
        maxLength={600}
        help="En minúscula, así el nombre de un juguete queda como lo escribe la familia."
        error={errors.needs}
        value={form.needs}
        onChange={(needs) => update({ needs })}
      />
      <TextArea
        label="Pasos"
        help="Uno por línea. Tres cortos es lo ideal."
        rows={4}
        error={errors.steps}
        value={form.steps}
        onChange={(steps) => update({ steps })}
      />
      <TextArea label="Más fácil" maxLength={600} error={errors.easier} value={form.easier} onChange={(easier) => update({ easier })} />
      <TextArea label="Más difícil" maxLength={600} error={errors.harder} value={form.harder} onChange={(harder) => update({ harder })} />
    </>
  )
}
