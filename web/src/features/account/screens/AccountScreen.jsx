import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { createAccount, signIn } from '../api'
import { PasswordField } from '../components/PasswordField'
import { useGoogleSignIn } from '../hooks/useGoogleSignIn'
import { checkAccount, offerToSave } from '../model'
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle'
import { useGoBack } from '../../../shared/hooks/useGoBack'
import { useRequest } from '../../../shared/hooks/useRequest'
import { read } from '../../../shared/store'
import { Body, Field, Footer, GoogleButton, Header, PrimaryButton, Screen, StatusLine } from '../../../shared/ui'

/**
 * 2b. Three fields and that's the whole account. "Ya tengo cuenta" reuses the
 * same screen in sign-in mode (`?modo=entrar`), with no name field. Google,
 * under the form, is the same in both modes. `?email=` fills the email, for an
 * invitation whose email already has an account (JUG-34).
 * Account copy still needs a voice pass.
 */
export function AccountScreen() {
  const { modo, campo, email: invitedEmail, error } = useSearch({ from: '/cuenta' })
  const signingIn = modo === 'entrar'
  const navigate = useNavigate()
  const goBack = useGoBack('/entrada')

  // Coming back from 2c to fix the email: keep what was typed.
  const [pending] = useState(() => read('account'))
  const [name, setName] = useState(pending?.name ?? '')
  const [email, setEmail] = useState(invitedEmail ?? pending?.email ?? '')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}))
  const request = useRequest()
  const google = useGoogleSignIn({ returnTo: signingIn ? '/cuenta?modo=entrar' : '/cuenta', error })

  useDocumentTitle(`${signingIn ? 'Entrá a tu cuenta' : 'Creá tu cuenta'} · Ludi`)

  /** @param {React.FormEvent<HTMLFormElement>} event */
  const submit = (event) => {
    event.preventDefault()
    if (request.busy || google.busy) return
    const found = checkAccount({ signingIn, name, email, password })
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      const input = event.currentTarget.elements.namedItem(first)
      if (input instanceof HTMLInputElement) input.focus()
      return
    }
    void request.run(async () => {
      if (signingIn) {
        const account = await signIn({ email: email.trim(), password })
        offerToSave({ email: email.trim(), password, name: account.name })
        // The first-run guard knows where the account goes next.
        void navigate({ to: '/', replace: true })
      } else {
        await createAccount({ name: name.trim(), email: email.trim(), password })
        offerToSave({ email: email.trim(), password, name: name.trim() })
        // A new account starts at Bienvenida, the onboarding's first screen (JUG-173).
        void navigate({ to: '/bienvenida', replace: true })
      }
    })
  }

  /** @param {string} field */
  const clearError = (field) => {
    if (errors[field]) setErrors(({ [field]: _cleared, ...rest }) => rest)
  }

  return (
    <Screen>
      <Header onBack={goBack} title={signingIn ? 'Entrá a tu cuenta' : 'Creá tu cuenta'} />
      <form className="screen-form" onSubmit={submit} noValidate>
        <Body className="form-body">
          {!signingIn && (
            <Field
              label="Cómo te llamás"
              name="name"
              value={name}
              error={errors.name}
              autoComplete="given-name"
              maxLength={80}
              autoCapitalize="words"
              onChange={(event) => {
                setName(event.target.value)
                clearError('name')
              }}
            />
          )}
          <Field
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            // "username", not "email": it's what password managers look for, even when the account is an email.
            autoComplete="username"
            maxLength={254}
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={campo === 'email'}
            value={email}
            error={errors.email}
            onChange={(event) => {
              setEmail(event.target.value)
              clearError('email')
            }}
          />
          <PasswordField
            autoComplete={signingIn ? 'current-password' : 'new-password'}
            value={password}
            error={errors.password}
            help={signingIn ? undefined : 'Mínimo 8 caracteres.'}
            onChange={(event) => {
              setPassword(event.target.value)
              clearError('password')
            }}
          />
          <StatusLine role="alert">{request.failure ?? google.failure}</StatusLine>
        </Body>
        <Footer>
          <PrimaryButton type="submit" busy={request.busy} busyLabel="Un momento">
            {signingIn ? 'Entrar' : 'Crear cuenta'}
          </PrimaryButton>
          <GoogleButton size="sm" busy={google.busy} onClick={() => !request.busy && google.start()} />
        </Footer>
      </form>
    </Screen>
  )
}
