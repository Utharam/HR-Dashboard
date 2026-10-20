import React, { useState } from 'react'
import { App } from './App'
import { LandingPage } from './views/LandingPage'
import { LoginPage } from './views/LoginPage'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { ThemeProvider } from './theme/ThemeContext'

type DoorView = 'landing' | 'login'

/**
 * The whole route layer. There is no router and no URL state by decision: three
 * views and one guard do not justify a runtime dependency.
 */
const RootView: React.FC = () => {
  const { status, signOut } = useAuth()
  const [view, setView] = useState<DoorView>('landing')

  if (status === 'loading') {
    return (
      <div className="boot-screen" role="status">
        Loading OmniHR…
      </div>
    )
  }

  if (status === 'authenticated') {
    return (
      <App
        onSignOut={async () => {
          await signOut()
          // A session may have started on the login screen. Signing out is a
          // return to the front door, not to the form that opened the door.
          setView('landing')
        }}
      />
    )
  }

  if (view === 'login') {
    return <LoginPage onBack={() => setView('landing')} />
  }

  return <LandingPage onSignIn={() => setView('login')} />
}

export const Root: React.FC = () => (
  <ThemeProvider>
    <AuthProvider>
      <RootView />
    </AuthProvider>
  </ThemeProvider>
)
