import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { VoiceLine, VoiceNote } from '../../voice'
import { addToDraft, keepDraft, understandFamily } from '../api'
import { LONG_TEXT } from '../model'
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle'
import { useRequest } from '../../../shared/hooks/useRequest'
import { SLOW_AFTER_MS } from '../../../shared/hooks/useSlowWait'
import { useStored } from '../../../shared/store'
import { Body, Footer, PrimaryButton, Screen, StatusLine, TertiaryButton, Waiting } from '../../../shared/ui'
import '../family.css'

const EXAMPLE =
  'Somos Alex y Caro, tenemos a Milán, de dos años, y a Inca, nuestra mascota. A Milán le encantan los dinosaurios y los caballos, y tiene un tren de madera que no suelta.'

/** How long "Deshacer" stays after "Reiniciar" erases the text. */
const UNDO_MS = 6000

/**
 * 2d. The prompt is the headline. The box grows to fill the screen, with the
 * brief's example as hint text; no counter, no validation. The box takes up to
 * LONG_TEXT characters, so a long paste is cut there instead of failing to
 * send, and a line says so once the box is full.
 *
 * The mic records a voice note (2e, JUG-95). Its words join the box, where
 * the parent checks them like anything typed, and "Listo" sends them on the
 * same path. While a note records, the prompt dims and the strip replaces
 * "Listo". The first time a device opens this screen, the mic is spotlighted,
 * since a voice note is the easiest way to tell Ludi about the family
 * (JUG-135).
 *
 * "Reiniciar", beside the help line, erases the text, and "Deshacer" brings it
 * back for a few seconds after.
 *
 * "Listo" sends the text to the API, whose LLM reads the family in it (JUG-11),
 * and opens the review card. Reading takes a while, so the button holds the
 * waiting animation and a line under it says so once the wait is long
 * (JUG-133); the parent's own words stay on screen the whole time. If it
 * fails, the text stays for another try. With nothing written, "Listo" opens
 * the form.
 */
export function TellScreen() {
  const navigate = useNavigate()
  const draft = useStored('familyDraft') ?? ''
  const request = useRequest({ slowAfter: SLOW_AFTER_MS })
  const [recording, setRecording] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState(/** @type {import('../../voice').VoiceMessage | null} */ (null))
  const [erased, setErased] = useState(/** @type {string | null} */ (null))

  useDocumentTitle('Contame de tu familia · Ludi')

  // "Deshacer" lasts a few seconds, and goes as soon as there's new text.
  useEffect(() => {
    if (erased === null) return
    if (draft) return setErased(null)
    const timer = setTimeout(() => setErased(null), UNDO_MS)
    return () => clearTimeout(timer)
  }, [erased, draft])

  const toForm = () => void navigate({ to: '/familia/corregir' })

  const understand = () => {
    if (request.busy) return
    const text = draft.trim().slice(0, LONG_TEXT)
    if (!text) return toForm()
    void request.run(async () => {
      await understandFamily(text)
      void navigate({ to: '/familia/revisar' })
    })
  }

  const restart = () => {
    setErased(draft)
    setVoiceMessage(null)
    keepDraft('')
  }

  const undo = () => {
    if (erased !== null) keepDraft(erased)
    setErased(null)
  }

  return (
    <Screen className={recording ? 'tell tell--recording' : 'tell'}>
      <div className="tell__prompt">
        <h1 className="prompt">
          Contame de tu familia: quiénes son, cuántos años tienen los chicos, qué les encanta y con qué juegan.
        </h1>
      </div>
      <Body className="tell__body">
        <label className="visually-hidden" htmlFor="family-text">
          Tu familia, en tus palabras
        </label>
        <textarea
          id="family-text"
          className="tell__text"
          value={draft}
          placeholder={EXAMPLE}
          maxLength={LONG_TEXT}
          readOnly={request.busy || recording}
          onChange={(event) => keepDraft(event.target.value)}
        />
        {/* Voice pass pending. */}
        {draft.length >= LONG_TEXT && <StatusLine role="status">Llegaste al máximo: lo que sigue ya no entra.</StatusLine>}
        <StatusLine role="alert">{request.failure}</StatusLine>
        {/* Voice pass pending. */}
        {request.state === 'slow' && <StatusLine role="status">Sigo leyendo lo que escribiste. Ya casi está.</StatusLine>}
        <VoiceLine message={voiceMessage} className="tell__voice-message" />
        {/* Voice pass pending: "Listo", "Prefiero un formulario", "Reiniciar", and "Deshacer". */}
        <div className="tell__help-row">
          <p className="tell__help">Escribilo, o mantené apretado el micrófono y contámelo.</p>
          {draft.trim() ? (
            <TertiaryButton size="inline" disabled={request.busy} onClick={restart}>
              Reiniciar
            </TertiaryButton>
          ) : (
            erased !== null && (
              <TertiaryButton size="inline" onClick={undo}>
                Deshacer
              </TertiaryButton>
            )
          )}
        </div>
        <TertiaryButton size="inline" onClick={toForm}>
          Prefiero un formulario
        </TertiaryButton>
      </Body>
      <Footer row>
        <VoiceNote onText={addToDraft} onMessage={setVoiceMessage} onRecording={setRecording} introduce>
          <PrimaryButton
            className="grow"
            busy={request.busy}
            busyLabel="Leyendo"
            busyMark={<Waiting size="strip" tone="on-primary" />}
            onClick={understand}
          >
            Listo
          </PrimaryButton>
        </VoiceNote>
      </Footer>
    </Screen>
  )
}
