import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Btn from '../components/Btn'
import Icon from '../components/Icon'
import adminPasswordResetApi from '../services/adminPasswordReset'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [validating, setValidating] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [account, setAccount] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let cancelled = false

    async function validate() {
      if (!token) {
        setError('Reset link is missing or invalid.')
        setValidating(false)
        return
      }

      try {
        const result = await adminPasswordResetApi.validateToken(token)
        if (!cancelled) {
          setAccount(result)
          setError('')
        }
      } catch (nextError) {
        if (!cancelled) {
          setAccount(null)
          setError(nextError.message || 'This reset link is invalid or has expired.')
        }
      } finally {
        if (!cancelled) setValidating(false)
      }
    }

    validate()
    return () => {
      cancelled = true
    }
  }, [token])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const result = await adminPasswordResetApi.resetPassword(token, password)
      setSuccess(result?.message || 'Password updated successfully.')
      window.setTimeout(() => navigate('/login', { replace: true }), 1800)
    } catch (nextError) {
      setError(nextError.message || 'Unable to reset password.')
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
            <Icon n="shield" sz={28} className="text-brand-600" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brand-600">Admin Operations</p>
          <h1 className="mt-2 text-2xl font-black text-[var(--text-main)]">Set new password</h1>
        </div>

        {validating ? (
          <div className="grid min-h-[180px] place-items-center text-center">
            <div>
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--border-main)] border-t-[var(--brand-500)]" />
              <p className="mt-4 text-sm font-bold text-[var(--text-muted)]">Validating reset link...</p>
            </div>
          </div>
        ) : account ? (
          <>
            <div className="mb-5 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm">
              <p className="font-bold text-[var(--text-main)]">{account.email}</p>
              {account.role ? <p className="mt-1 text-[var(--text-muted)]">Role: {account.role}</p> : null}
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">New password</span>
                <div className="relative">
                  <Icon n="lock" sz={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={submitting}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="h-12 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] pl-11 pr-12 text-sm font-semibold text-[var(--text-main)] outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Icon n="eye" sz={18} />
                  </button>
                </div>
              </label>

              <label className="grid gap-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Confirm password</span>
                <div className="relative">
                  <Icon n="lock" sz={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    disabled={submitting}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="h-12 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] pl-11 pr-4 text-sm font-semibold text-[var(--text-main)] outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
                    placeholder="Confirm new password"
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
                {submitting ? 'Saving...' : 'Update password'}
              </Btn>
            </form>
          </>
        ) : (
          <div className="grid gap-4 text-center">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-600">
              {error || 'This reset link is invalid or has expired.'}
            </div>
            <Link to="/forgot-password" className="text-sm font-bold text-brand-600 hover:text-brand-500">
              Request a new reset link
            </Link>
          </div>
        )}

        <p className="mt-5 text-center text-sm font-semibold text-[var(--text-muted)]">
          <Link to="/login" className="text-brand-600 hover:text-brand-500">Back to sign in</Link>
        </p>
      </section>
    </main>
  )
}
