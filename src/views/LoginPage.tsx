import React, { useState } from 'react'
import { Callout } from '../components/Callout'
import { ThemeToggle } from '../components/ThemeToggle'
import { useAuth } from '../auth/AuthContext'
import { isDomainLike } from '../auth/domain'
import type { SsoProvider } from '../types'

const GENERIC_ERROR = 'We could not sign you in with those details.'

export const LoginPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { signIn, signInWithProvider } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [domain, setDomain] = useState('')
  const [showDomain, setShowDomain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim()) {
      setError('Enter your work email to continue.')
      return
    }
    if (!password) {
      setError('Enter your password to continue.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      await signIn({ email, password })
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleProvider = async (provider: SsoProvider) => {
    if (provider === 'domain') {
      const candidate = domain.trim()
      if (!candidate) {
        setError('Enter your work domain to continue.')
        return
      }
      if (!isDomainLike(candidate)) {
        setError('Enter a valid work domain (for example, acme.com).')
        return
      }
    }
    setError(null)
    setIsSubmitting(true)
    try {
      await signInWithProvider(provider, provider === 'domain' ? domain.trim() : undefined)
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-theme no-print">
        <ThemeToggle />
      </div>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-mark" aria-hidden="true">Ω</div>
            <span className="brand-name">Omni<span className="text-primary">HR</span></span>
          </div>

          <h1 className="auth-title">Sign in</h1>
          <p className="auth-sub">Use the account your organisation provisioned.</p>

          {error && <Callout tone="danger">{error}</Callout>}

          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div className="omni-field">
              <label className="omni-label" htmlFor="login-email">Work email</label>
              <input
                id="login-email"
                className="omni-input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="omni-field">
              <label className="omni-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                className="omni-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
              Sign in
            </button>
          </form>

          <div className="auth-divider">or continue with</div>

          <div className="auth-sso">
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => void handleProvider('microsoft')}
              disabled={isSubmitting}
            >
              Microsoft
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => void handleProvider('okta')}
              disabled={isSubmitting}
            >
              Okta
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => setShowDomain((shown) => !shown)}
              disabled={isSubmitting}
            >
              Sign in with SSO by domain
            </button>

            {showDomain && (
              <div className="auth-domain">
                <div className="omni-field">
                  <label className="omni-label" htmlFor="login-domain">Work domain</label>
                  <input
                    id="login-domain"
                    className="omni-input"
                    type="text"
                    autoComplete="organization"
                    placeholder="acme.com"
                    value={domain}
                    onChange={(event) => setDomain(event.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => void handleProvider('domain')}
                  disabled={isSubmitting}
                >
                  Continue with domain
                </button>
              </div>
            )}
          </div>

          <p className="auth-foot">
            Access is provisioned by your organisation's administrator.
          </p>

          <button type="button" className="auth-back" onClick={onBack}>
            Back to OmniHR
          </button>
        </div>
      </main>
    </div>
  )
}
