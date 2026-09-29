import { useEffect, useState } from 'react'
import { PrimaryButton, Sheet, StepList, TertiaryButton } from '../../../shared/ui'
import { endInstallOffer, installOffered, installWay, onPromptChange, promptInstall } from '../api'
import '../install.css'

/** @typedef {import('../api').InstallWay} InstallWay */

/**
 * The offer to add Ludi to the home screen, on a new account's first Home
 * (JUG-202). Where the browser can install, the button opens its dialog; on
 * an iPhone, and in an Android browser that can't, the steps say how. Closed
 * either way, it isn't shown again. A device that can't install, or already
 * runs the app, never sees it.
 */
export function InstallSheet() {
  const [way, setWay] = useState(() => (installOffered() ? installWay() : null))

  useEffect(() => {
    if (installOffered() && !way) endInstallOffer()
  }, [way])

  // The browser's prompt may arrive after Home: the button replaces the steps.
  useEffect(
    () =>
      onPromptChange(() => {
        if (installWay() === 'prompt') setWay((current) => current && 'prompt')
      }),
    [],
  )

  const close = () => {
    endInstallOffer()
    setWay(null)
  }

  const install = async () => {
    await promptInstall()
    close()
  }

  const host = location.host

  return (
    <Sheet
      open={way !== null}
      onClose={close}
      title="Tené a Ludi a mano"
      footer={
        way === 'prompt' ? (
          <>
            <PrimaryButton size="md" onClick={() => void install()}>
              Agregar a inicio
            </PrimaryButton>
            <TertiaryButton onClick={close}>Ahora no</TertiaryButton>
          </>
        ) : (
          <PrimaryButton size="md" onClick={close}>
            Listo
          </PrimaryButton>
        )
      }
    >
      {/* Voice pass pending: the title, the line, the steps, and the buttons. */}
      <div className="install-sheet">
        <p className="install-sheet__line">Sumá Ludi a la pantalla de inicio y abrí la app de un toque, sin pasar por el navegador.</p>
        {way === 'iphone' && (
          <>
            <StepList steps={['Tocá Compartir, el cuadrado con la flecha.', 'Elegí Agregar a inicio.']} />
            <p className="install-sheet__note">Si no aparece, abrí {host} en Safari.</p>
          </>
        )}
        {way === 'android' && (
          <StepList steps={[`Abrí ${host} en Chrome.`, 'En el menú ⋮, tocá Agregar a la pantalla principal.']} />
        )}
      </div>
    </Sheet>
  )
}
