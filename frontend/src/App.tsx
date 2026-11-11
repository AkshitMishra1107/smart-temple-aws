import { lazy, Suspense, useEffect, useState } from 'react'
import { isAuthConfigured, isStaffSession, getSession, signedInEmail, signOut, beginSignIn, completeSignIn, type UserSession } from './lib/auth'
import VisitorPortal from './components/VisitorPortal'

type Page = 'visit' | 'bookings' | 'staff'
const StaffPortal = lazy(() => import('./components/StaffPortal'))

export default function App() {
  const [session, setSession] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [page, setPage] = useState<Page>('visit')
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    let active = true
    const isCallback = window.location.pathname === '/auth/callback'
    const action = isCallback ? completeSignIn() : getSession()
    action
      .then((value) => {
        if (!active) return
        setSession(value)
        if (isCallback) window.history.replaceState({}, document.title, '/')
      })
      .catch((error: unknown) => {
        if (!active) return
        setAuthError(error instanceof Error ? error.message : 'Sign-in could not be completed.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  async function handleSignIn() {
    setSigningIn(true)
    setAuthError('')
    try {
      await beginSignIn()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign-in could not be started.')
      setSigningIn(false)
    }
  }

  const staff = isStaffSession(session)
  const email = signedInEmail(session)

  if (loading) {
    return <main className="loading-screen" aria-live="polite">Checking your sign-in…</main>
  }

  if (!session) {
    return (
      <main className="sign-in-shell">
        <div className="sign-in-brand" aria-label="Temple visits">
          <BrandMark />
          <span>Temple visits</span>
        </div>
        <section className="sign-in-card" aria-labelledby="welcome-title">
          <div className="sign-in-emblem" aria-hidden="true"><TempleGlyph /></div>
          <p className="eyebrow">A clearer way to plan your visit</p>
          <h1 id="welcome-title">Make room for what matters.</h1>
          <p className="sign-in-copy">
            Choose General Darshan or a scheduled Aarti, see current availability, and keep your group’s pass in one place.
          </p>
          <ul className="sign-in-points">
            <li><span aria-hidden="true">01</span> See how many places remain</li>
            <li><span aria-hidden="true">02</span> Reserve together as a group</li>
            <li><span aria-hidden="true">03</span> Show one pass when you arrive</li>
          </ul>
          {authError && <p className="notice notice-error" role="alert">{authError}</p>}
          {!isAuthConfigured() && (
            <p className="notice" role="status">The AWS sign-in service will be available after the project is deployed.</p>
          )}
          <button className="button button-primary sign-in-button" type="button" onClick={handleSignIn} disabled={!isAuthConfigured() || signingIn}>
            {signingIn ? 'Opening sign-in…' : 'Sign in or create account'}
          </button>
          <p className="quiet-note">No payment is required to reserve a visit.</p>
        </section>
        <p className="sign-in-footer">For devotees and temple staff</p>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={() => setPage('visit')} aria-label="Go to visit booking">
          <BrandMark />
          <span>Temple visits</span>
        </button>
        <nav className="topnav" aria-label="Main navigation">
          <button className={page === 'visit' ? 'nav-link active' : 'nav-link'} type="button" aria-current={page === 'visit' ? 'page' : undefined} onClick={() => setPage('visit')}>Book a visit</button>
          <button className={page === 'bookings' ? 'nav-link active' : 'nav-link'} type="button" aria-current={page === 'bookings' ? 'page' : undefined} onClick={() => setPage('bookings')}>My passes</button>
          {staff && <button className={page === 'staff' ? 'nav-link active' : 'nav-link'} type="button" aria-current={page === 'staff' ? 'page' : undefined} onClick={() => setPage('staff')}>Staff desk</button>}
        </nav>
        <div className="account-menu">
          <span className="account-email" title={email}>{email || 'Signed in'}</span>
          <button className="button button-quiet" type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="main-content">
        {page === 'visit' && <VisitorPortal />}
        {page === 'bookings' && <VisitorPortal historyOnly />}
        {page === 'staff' && staff && (
          <Suspense fallback={<p className="loading-copy" role="status">Opening the staff desk…</p>}>
            <StaffPortal />
          </Suspense>
        )}
      </main>
      <footer className="site-footer">
        <span>Temple visits</span>
        <span>A booking helps plan attendance. Temple staff guide entry on site.</span>
      </footer>
    </div>
  )
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><TempleGlyph /></span>
}

function TempleGlyph() {
  return (
    <svg viewBox="0 0 32 32" fill="none" focusable="false">
      <path d="M5 25h22M8 21h16M11 17h10M12 12l4-7 4 7M14 12v5m4-5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="4" r="1.4" fill="currentColor" />
    </svg>
  )
}
