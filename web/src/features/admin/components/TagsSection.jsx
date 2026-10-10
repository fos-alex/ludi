import { useEffect, useState } from 'react'
import { listMaterials, listThemes } from '../api'
import { adminFailure } from '../model'
import { TextArea } from './TemplateInputs'
import { CheckIcon, Chips, FieldGroup, Label } from '../../../shared/ui'

/** @typedef {import('../model').FormState} FormState */
/** @typedef {import('../types').MaterialCategory} MaterialCategory */
/** @typedef {import('../types').Theme} Theme */

/**
 * "Etiquetas": the materials, picked from the API's list by category, the
 * themes, picked from the API's list too, and skills and safety rules, one
 * per line. A family that has a template's material marked off is never
 * offered it (JUG-153), and a kid who loves one of its themes is offered it
 * more (JUG-104). The safety rules are part of the reviewed core, which
 * adapting never changes.
 * @param {{ form: FormState, errors: import('../model').Errors, update: (change: Partial<FormState>) => void }} props
 */
export function TagsSection({ form, errors, update }) {
  const [categories, setCategories] = useState(/** @type {MaterialCategory[] | null} */ (null))
  const [themes, setThemes] = useState(/** @type {Theme[] | null} */ (null))
  const [failure, setFailure] = useState(/** @type {string | null} */ (null))

  useEffect(() => {
    listMaterials().then(setCategories, (error) => setFailure(adminFailure(error)))
    listThemes().then(setThemes, (error) => setFailure(adminFailure(error)))
  }, [])

  /** @param {'materials' | 'themes'} field @param {string} key */
  const toggle = (field, key) =>
    update({ [field]: form[field].includes(key) ? form[field].filter((each) => each !== key) : [...form[field], key] })

  /** @param {'materials' | 'themes'} field @param {{ key: string, label: string }} item */
  const chip = (field, item) => {
    const on = form[field].includes(item.key)
    return (
      <button key={item.key} type="button" className="chip admin-chip" aria-pressed={on} onClick={() => toggle(field, item.key)}>
        {on && <CheckIcon size={16} />}
        {item.label}
      </button>
    )
  }

  return (
    <>
      <Label>Etiquetas</Label>
      <p className="field__help">
        Materiales: solo lo que el juego no puede hacer sin eso. Si la familia lo tiene desmarcado, no se lo ofrece.
      </p>
      {failure && <p className="field__error">{failure}</p>}
      {categories?.map((category) => (
        <FieldGroup key={category.key} label={category.label}>
          <Chips>{category.materials.map((material) => chip('materials', material))}</Chips>
        </FieldGroup>
      ))}
      <p className="field__help">Temas: de qué trata el juego. A un chico al que le encanta uno de estos se le ofrece más.</p>
      {themes && (
        <FieldGroup label="Temas">
          <Chips>{themes.map((theme) => chip('themes', theme))}</Chips>
        </FieldGroup>
      )}
      <TextArea
        label="Habilidades"
        help="Una por línea."
        error={errors.skills}
        value={form.skills} onChange={(skills) => update({ skills })} />
      <TextArea
        label="Seguridad"
        help="Una regla por línea. Son parte del núcleo revisado: la adaptación nunca las cambia."
        error={errors.safety}
        value={form.safety}
        onChange={(safety) => update({ safety })}
      />
    </>
  )
}
