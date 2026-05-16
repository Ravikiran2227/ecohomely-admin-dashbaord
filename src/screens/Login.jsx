import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Btn from '../components/Btn'
import Icon from '../components/Icon'
import { useAuth } from '../context/authContextValue'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, loading: authLoading, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const redirectTo = location.state?.from || '/dashboard'

  useEffect(() => {
    if (!authLoading && currentUser) {
      navigate(redirectTo, { replace: true })
    }
  }, [authLoading, currentUser, navigate, redirectTo])

  if (!authLoading && currentUser) {
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const result = await login(username, password)
      if (result.success) {
        navigate(redirectTo, { replace: true })
      } else {
        setError(result.error || 'Invalid credentials')
      }
    } catch (nextError) {
      setError(nextError.message || 'Unable to sign in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] grid place-items-center p-5 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-brand-500/20 to-transparent" />
      <section className="relative w-full max-w-[420px] rounded-3xl border border-[var(--border-main)] bg-[var(--card-bg)] shadow-[var(--shadow-soft)] p-7">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-3xl border border-brand-500/30 bg-brand-500/15 flex items-center justify-center">
            <img src="/logo.png" alt="Ecohomely" className="h-10 w-10 object-contain" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brand-600">Admin Operations</p>
          <h1 className="mt-2 text-2xl font-black text-[var(--text-main)]">Sign in</h1>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Username</span>
            <div className="relative">
              <Icon n="users" sz={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={submitting}
                required
                autoComplete="username"
                className="h-12 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] pl-11 pr-4 text-sm font-semibold text-[var(--text-main)] outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
                placeholder="Enter username or email"
              />
            </div>
          </label>

          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Password</span>
            <div className="relative">
              <Icon n="shield" sz={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                required
                autoComplete="current-password"
                className="h-12 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] pl-11 pr-12 text-sm font-semibold text-[var(--text-main)] outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition hover:text-[var(--text-main)]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon n="eye" sz={18} />
              </button>
            </div>
          </label>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-600">
              {error}
            </div>
          ) : null}

          <Btn v="primary" className="h-12 justify-center" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Login'}
          </Btn>
        </form>
      </section>
    </main>
  )
}
