import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { createAccount } from '../api'
import { useGoogleSignIn } from '../hooks/useGoogleSignIn'
import { checkAccount, offerToSave } from '../model'
import { PasswordField } from './PasswordField'
import { useRequest } from '../../../shared/hooks/useRequest'
import { Body, Field, Footer, GoogleButton, Header, PrimaryButton, Screen, StatusLine } from '../../../shared/ui'

/**
 * Creating an account from an invitation (JUG-34): the invited email is
 * already there and can't be changed, so a name and a password are all it
 * takes, or Google with the same email. A new account opens Bienvenida.
 * Account copy still needs a voice pass.
 * @param {{ token: string, email: string, error?: string }} props `error` is the code a failed Google sign-up came back with
 */
export function InvitedSignUp({ token, email, error }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}))
  const request = useRequest()
  const google = useGoogleSignIn({
    returnTo: `/invitacion?${new URLSearchParams({ token, email })}`,
    error,
    invitation: { token, email },
  })

  /** @param {React.FormEvent<HTMLFormElement>} event */
  const submit = (event) => {
    event.preventDefault()
    if (request.busy || google.busy) return
    const found = checkAccount({ signingIn: false, name, email, password })
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      const input = event.currentTarget.elements.namedItem(first)
      if (input instanceof HTMLInputElement) input.focus()
      return
    }
    void request.run(async () => {
      await createAccount({ name: name.trim(), email, password, invitation: token })
      offerToSave({ email, password, name: name.trim() })
      void navigate({ to: '/bienvenida', replace: true })
    })
  }

  /** @param {string} field */
  const clearError = (field) => {
    if (errors[field]) setErrors(({ [field]: _cleared, ...rest }) => rest)
  }

  return (
    <Screen>
      <Header title="Te invitamos a Ludi" />
      <form className="screen-form" onSubmit={submit} noValidate>
        <Body className="form-body">
          <p className="page-lede invitation__lede">Creá tu cuenta con este email, o seguí con Google.</p>
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
          <Field
            label="Email"
            name="email"
            type="email"
            // "username", so a password manager saves the password under this email.
            autoComplete="username"
            readOnly
            value={email}
            help="Es el email de la invitación."
          />
          <PasswordField
            value={password}
            error={errors.password}
            help="Mínimo 8 caracteres."
            autoComplete="new-password"
            onChange={(event) => {
              setPassword(event.target.value)
              clearError('password')
            }}
          />
          <StatusLine role="alert">{request.failure ?? google.failure}</StatusLine>
        </Body>
        <Footer>
          <PrimaryButton type="submit" busy={request.busy} busyLabel="Un momento">
            Crear cuenta
          </PrimaryButton>
          <GoogleButton size="sm" busy={google.busy} onClick={() => !request.busy && google.start()} />
        </Footer>
      </form>
    </Screen>
  )
}
