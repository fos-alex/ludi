import { useEffect, useState } from 'react'
import { deleteAccount, invite, listUsers } from '../api'
import { AdminNav } from '../components/AdminNav'
import { accountLine, adminFailure, invitationLine, inviteFailure, inviteNews, looksLikeEmail } from '../model'
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle'
import { Body, Dots, Field, Header, MetaLabel, PrimaryButton, Screen, StatusLine } from '../../../shared/ui'
import '../admin.css'

/** @typedef {import('../types').AdminAccount} AdminAccount */
/** @typedef {import('../types').Invitation} Invitation */

/**
 * Usuarios (JUG-34): invite an email, and see the invitations still open and
 * the accounts. An invitation that has become an account shows only as the
 * account. Borrar removes an account with everything it owns, so the same
 * email can sign up again (JUG-175). No login yet, like the rest of the admin.
 */
export function UsersScreen() {
  const [users, setUsers] = useState(/** @type {{ users: AdminAccount[], invitations: Invitation[] } | null} */ (null))
  const [failure, setFailure] = useState(/** @type {string | null} */ (null))
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState(/** @type {string | null} */ (null))
  // What is being sent: `form`, or the email of the row whose Reenviar was tapped.
  const [sending, setSending] = useState(/** @type {string | null} */ (null))
  const [news, setNews] = useState(/** @type {{ text: string, link: string | null } | null} */ (null))
  // The account whose Borrar was tapped, while it is being removed.
  const [removing, setRemoving] = useState(/** @type {string | null} */ (null))

  useDocumentTitle('Usuarios · Admin · Ludi')

  const load = () => listUsers().then(setUsers, (error) => setFailure(adminFailure(error)))

  useEffect(() => {
    void load()
  }, [])

  /** @param {string} address @param {boolean} [fromForm] */
  const send = async (address, fromForm = false) => {
    setSending(fromForm ? 'form' : address)
    setFailure(null)
    setNews(null)
    try {
      setNews(inviteNews(await invite(address)))
      if (fromForm) setEmail('')
      await load()
    } catch (error) {
      setFailure(inviteFailure(error))
    }
    setSending(null)
  }

  /** @param {AdminAccount} account */
  const remove = async (account) => {
    if (removing) return
    const name = account.name ? `${account.name} (${account.email})` : account.email
    if (!window.confirm(`¿Borrar la cuenta de ${name}? Se va con su familia, sus juguetes, sus juegos y sus cuentos, y no se puede deshacer.`)) return
    setRemoving(account.id)
    setFailure(null)
    setNews(null)
    try {
      await deleteAccount(account.id)
      setNews({ text: `Borramos la cuenta de ${account.email}. Ya podés invitar ese email de nuevo.`, link: null })
      await load()
    } catch (error) {
      setFailure(adminFailure(error))
    }
    setRemoving(null)
  }

  /** @param {React.FormEvent} event */
  const submit = (event) => {
    event.preventDefault()
    if (sending) return
    if (!looksLikeEmail(email)) return setEmailError('Revisá el email: parece que le falta algo.')
    void send(email.trim(), true)
  }

  const open = users?.invitations.filter((invitation) => invitation.status !== 'accepted') ?? []

  return (
    <Screen className="admin">
      <Header title="Usuarios" />
      <Body className="page-body">
        <AdminNav />
        <form className="admin-invite" onSubmit={submit} noValidate>
          <Field
            label="Invitar a Ludi"
            help="Le llega un email con el link, que es la única forma de crear una cuenta. Nadie de afuera de la familia hasta que los guardrails estén completos."
            type="email"
            inputMode="email"
            autoComplete="off"
            maxLength={254}
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            error={emailError}
            onChange={(event) => {
              setEmail(event.target.value)
              setEmailError(null)
            }}
          />
          <PrimaryButton type="submit" size="md" busy={sending === 'form'} busyLabel="Invitando">
            Invitar
          </PrimaryButton>
        </form>
        <StatusLine role="status">{news?.text}</StatusLine>
        {news?.link && <p className="admin-invite__link">{news.link}</p>}
        <StatusLine role="alert">{failure}</StatusLine>
        {!users && !failure && <Dots tone="page" />}

        {open.length > 0 && (
          <section className="admin-section">
            <MetaLabel wide as="h2">
              Invitaciones
            </MetaLabel>
            <ul className="admin-list">
              {open.map((invitation) => (
                <li key={invitation.id} className={`admin-row${invitation.status === 'expired' ? ' is-off' : ''}`}>
                  <div className="admin-row__main">
                    <span className="admin-row__title">{invitation.email}</span>
                    <span className="card-meta">{invitationLine(invitation)}</span>
                  </div>
                  <button
                    type="button"
                    className="admin-switch"
                    aria-label={`Reenviar la invitación a ${invitation.email}`}
                    disabled={sending !== null}
                    onClick={() => void send(invitation.email)}
                  >
                    {sending === invitation.email ? 'Enviando' : 'Reenviar'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {users && (
          <section className="admin-section">
            <MetaLabel wide as="h2">
              Cuentas
            </MetaLabel>
            {users.users.length === 0 && <StatusLine>Todavía no hay cuentas.</StatusLine>}
            <ul className="admin-list">
              {users.users.map((account) => (
                <li key={account.id} className="admin-row">
                  <div className="admin-row__main">
                    <span className="admin-row__title">{account.name || account.email}</span>
                    <span className="card-meta">{accountLine(account)}</span>
                  </div>
                  <button
                    type="button"
                    className="admin-switch"
                    aria-label={`Borrar la cuenta de ${account.email}`}
                    disabled={removing !== null}
                    onClick={() => void remove(account)}
                  >
                    {removing === account.id ? 'Borrando' : 'Borrar'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Body>
    </Screen>
  )
}
