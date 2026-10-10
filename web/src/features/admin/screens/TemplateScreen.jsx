import { useEffect, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { createTemplate, deleteTemplate, loadTemplate, saveTemplate } from '../api'
import { AudienceSection } from '../components/AudienceSection'
import { NameSection } from '../components/NameSection'
import { RatingSection } from '../components/RatingSection'
import { TagsSection } from '../components/TagsSection'
import { TextsSection } from '../components/TextsSection'
import { adminFailure, check, EMPTY, NEW, toFields, toForm } from '../model'
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle'
import { useGoBack } from '../../../shared/hooks/useGoBack'
import { useRequest } from '../../../shared/hooks/useRequest'
import { ApiError } from '../../../shared/http'
import { Body, Dots, Footer, Header, PrimaryButton, Screen, StatusLine, TertiaryButton } from '../../../shared/ui'
import '../admin.css'

/** @typedef {import('../model').FormState} FormState */
/** @typedef {import('../model').Errors} Errors */
/** @typedef {import('../types').Reactions} Reactions */

const CHECK_FIELDS = 'Revisá los campos marcados.'

/** A slug another template holds, or held before it was deleted. @param {unknown} error */
const slugTaken = (error) => error instanceof ApiError && error.code === 'SLUG_TAKEN'

/**
 * One activity template, every field of it, or a new one at /admin/nuevo.
 * Texts keep their slots unfilled; the API checks them again on save.
 */
export function TemplateScreen() {
  const { id } = useParams({ from: '/admin/$id' })
  const isNew = id === NEW
  const navigate = useNavigate()
  const goBack = useGoBack('/admin')
  const [form, setForm] = useState(/** @type {FormState | null} */ (isNew ? EMPTY : null))
  // Every family's reactions, which the form doesn't edit. None for a new template.
  const [reactions, setReactions] = useState(/** @type {Reactions | null} */ (null))
  const [slugTouched, setSlugTouched] = useState(false)
  const [errors, setErrors] = useState(/** @type {Errors} */ ({}))
  // A taken slug is a field to fix, so it points at the fields instead of failing.
  const request = useRequest({ describe: (error) => (slugTaken(error) ? CHECK_FIELDS : adminFailure(error)) })

  useDocumentTitle(`${isNew ? 'Nuevo juego' : 'Editar juego'} · Admin · Ludi`)

  useEffect(() => {
    if (isNew) return
    loadTemplate(id).then(
      (template) => {
        setForm(toForm(template))
        setReactions(template.reactions)
      },
      (error) =>
        request.fail(
          error instanceof ApiError && error.status === 404 ? 'No encontré ese juego. Puede que lo hayan borrado.' : error,
        ),
    )
  }, [id, isNew])

  /** @param {Partial<FormState>} change */
  const update = (change) => setForm((current) => current && { ...current, ...change })

  /** @param {React.FormEvent} event */
  const save = (event) => {
    event.preventDefault()
    if (!form || request.busy) return
    const found = check(form, isNew)
    setErrors(found)
    if (Object.keys(found).length > 0) return request.fail(CHECK_FIELDS)
    void request.run(async () => {
      try {
        if (isNew) await createTemplate({ slug: form.slug.trim(), ...toFields(form) })
        else await saveTemplate(id, toFields(form))
      } catch (error) {
        if (slugTaken(error)) setErrors({ slug: 'Ya hay un juego con ese slug, o lo hubo: uno borrado lo sigue ocupando.' })
        throw error
      }
      void navigate({ to: '/admin' })
    })
  }

  const remove = () => {
    if (!form || request.busy) return
    if (!window.confirm(`¿Borrar «${form.title}»? No se puede deshacer, y la semilla no lo vuelve a cargar.`)) return
    void request.run(async () => {
      await deleteTemplate(id)
      void navigate({ to: '/admin' })
    })
  }

  return (
    <Screen className="admin">
      <Header onBack={goBack} title={isNew ? 'Nuevo juego' : 'Editar juego'} />
      {!form ? (
        <Body className="page-body">
          {request.failure ? <StatusLine role="alert">{request.failure}</StatusLine> : <Dots tone="page" />}
        </Body>
      ) : (
        <form className="screen-form" onSubmit={save} noValidate>
          <Body className="form-body">
            <NameSection
              form={form}
              errors={errors}
              update={update}
              isNew={isNew}
              slugTouched={slugTouched}
              onSlugTouched={() => setSlugTouched(true)}
            />
            <RatingSection form={form} reactions={reactions} update={update} />
            <AudienceSection form={form} errors={errors} update={update} />
            <TextsSection form={form} errors={errors} update={update} />
            <TagsSection form={form} errors={errors} update={update} />
            {!isNew && (
              <TertiaryButton size="inline" onClick={remove}>
                Borrar juego
              </TertiaryButton>
            )}
            <StatusLine role="alert">{request.failure}</StatusLine>
          </Body>
          <Footer sticky>
            <PrimaryButton type="submit" busy={request.busy} busyLabel="Guardando">
              Guardar
            </PrimaryButton>
          </Footer>
        </form>
      )}
    </Screen>
  )
}
