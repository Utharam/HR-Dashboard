import React from 'react'
import { ThemeToggle } from '../components/ThemeToggle'

/**
 * The front door. It says what the product is, shows the product, and offers one
 * way in. The credibility strip is factual, not persuasive: these are things the
 * console actually does, not claims about it.
 */
export const LandingPage: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => (
  <div className="landing-shell">
    <header className="landing-nav">
      <div className="landing-brand">
        <div className="brand-mark" aria-hidden="true">Ω</div>
        <div className="landing-brand__text">
          <span className="brand-name">Omni<span className="text-primary">HR</span></span>
          <span className="brand-tagline">Enterprise Workforce Suite</span>
        </div>
      </div>
      <div className="landing-nav__actions">
        <ThemeToggle />
        <button type="button" className="btn btn-secondary btn-sm" onClick={onSignIn}>
          Sign in
        </button>
      </div>
    </header>

    <main className="landing-main">
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow">Workforce operations</p>
          <h1 className="landing-headline">The operating console for your workforce.</h1>
          <p className="landing-lede">
            Staff records, statutory payroll and compliance in one place — audit-ready.
          </p>
          <div className="landing-actions">
            <button type="button" className="btn btn-primary" onClick={onSignIn}>
              Sign in to OmniHR
            </button>
          </div>
        </div>

        {/* Decoration: a static illustration of the console, never live data. */}
        <div className="product-preview" aria-hidden="true">
          <div className="product-preview__rail">
            <span className="product-preview__dot product-preview__dot--on" />
            <span className="product-preview__dot" />
            <span className="product-preview__dot" />
            <span className="product-preview__dot" />
            <span className="product-preview__dot" />
          </div>
          <div className="product-preview__body">
            <div className="product-preview__tiles">
              <div className="product-preview__tile">
                <span className="product-preview__label">Active</span>
                <span className="product-preview__value">184</span>
              </div>
              <div className="product-preview__tile">
                <span className="product-preview__label">Payroll</span>
                <span className="product-preview__value">₹2.3Cr</span>
              </div>
              <div className="product-preview__tile">
                <span className="product-preview__label">Attendance</span>
                <span className="product-preview__value">94.2%</span>
              </div>
              <div className="product-preview__tile">
                <span className="product-preview__label">Open roles</span>
                <span className="product-preview__value">9</span>
              </div>
            </div>
            <div className="product-preview__bars">
              <span /><span /><span /><span /><span /><span />
            </div>
          </div>
        </div>
      </section>

      <section className="cred-strip" aria-label="What OmniHR covers">
        <div className="cred-item">
          <strong>Statutory payroll</strong>
          <span>EPF, Professional Tax and LOP in one run.</span>
        </div>
        <div className="cred-item">
          <strong>EPF &amp; Professional Tax</strong>
          <span>Statutory deductions applied consistently across the roster.</span>
        </div>
        <div className="cred-item">
          <strong>Audit-ready registers</strong>
          <span>Every figure traces back to the record it came from.</span>
        </div>
        <div className="cred-item">
          <strong>Excel import/export</strong>
          <span>A round-trip that reads back as the register it came from.</span>
        </div>
      </section>
    </main>

    <footer className="site-footer">
      <span>OmniHR · Enterprise Workforce Suite</span>
      <span>v3.0</span>
    </footer>
  </div>
)
