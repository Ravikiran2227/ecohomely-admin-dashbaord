import { useState } from 'react'
import { Link } from 'react-router-dom'
import Btn from '../components/Btn'
import Icon from '../components/Icon'
import adminPasswordResetApi, {
  ACCOUNT_NOT_FOUND_MESSAGE,
  RESET_EMAIL_SENT_MESSAGE,
} from '../services/adminPasswordReset'

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      const result = await adminPasswordResetApi.requestReset(identifier.trim())
      if (result?.success === false || result?.found === false) {
        setError(result?.message || ACCOUNT_NOT_FOUND_MESSAGE)
        return
      }
      setSuccess(result?.message || RESET_EMAIL_SENT_MESSAGE)
    } catch (nextError) {
      if (nextError.status === 404) {
        setError(nextError.message || ACCOUNT_NOT_FOUND_MESSAGE)
      } else {
        setError(nextError.message || 'Unable to send reset email. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] grid place-items-center p-5 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-brand-500/20 to-transparent" />
      <section className="relative w-full max-w-[420px] rounded-3xl border border-[var(--border-main)] bg-[var(--card-bg)] shadow-[var(--shadow-soft)] p-7">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-brand-500/30 bg-brand-500/15">
            <Icon n="lock" sz={28} className="text-brand-600" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brand-600">Admin Operations</p>
          <h1 className="mt-2 text-2xl font-black text-[var(--text-main)]">Forgot password</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Enter the email registered for your admin, manager, or sub-manager account. A reset link will be sent only when the account exists in Firebase.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Email or username</span>
            <div className="relative">
              <Icon n="users" sz={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                disabled={submitting}
                required
                autoComplete="username email"
                type="text"
                className="h-12 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] pl-11 pr-4 text-sm font-semibold text-[var(--text-main)] outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
                placeholder="admin@example.com"
              />
            </div>
          </label>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-600">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              {success}
            </div>
          ) : null}

          <Btn v="primary" className="h-12 justify-center" disabled={submitting}>
            {submitting ? 'Sending...' : 'Send reset link'}
          </Btn>
        </form>

        <p className="mt-5 text-center text-sm font-semibold text-[var(--text-muted)]">
          <Link to="/login" className="text-brand-600 hover:text-brand-500">Back to sign in</Link>
        </p>
      </section>
    </main>
  )
}
