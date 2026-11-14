import React, { useState } from 'react'
import { App } from './App'
import { LandingPage } from './views/LandingPage'
import { LoginPage } from './views/LoginPage'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { ThemeProvider } from './theme/ThemeContext'
import { DataGate, useDataGate } from './data/DataGate'

type DoorView = 'landing' | 'login'

/**
 * The whole route layer. There is no router and no URL state by decision: three
 * views and one guard do not justify a runtime dependency.
 *
 * The layers are ordered ThemeProvider -> DataGate -> AuthProvider. Theme stays
 * synchronous (it is applied before first paint), business data loads once above
 * auth, and only then does the session resolve. Both async layers render the same
 * token-styled boot screen, so to the user it is one continuous load, not two.
 */
const RootView: React.FC = () => {
  const { status, signOut } = useAuth()
  // The gate's completed load. The console below receives the same snapshot and the
  // same store the gate loaded once; nothing else in the app reads storage for data.
  const { store, snapshot } = useDataGate()
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
          try {
            await signOut()
          } finally {
            // A session may have started on the login screen. Signing out is a
            // return to the front door, not to the form that opened the door,
            // even if the client-side sign-out call itself failed.
            setView('landing')
          }
        }}
        initialData={snapshot}
        dataStore={store}
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
    <DataGate>
      <AuthProvider>
        <RootView />
      </AuthProvider>
    </DataGate>
  </ThemeProvider>
)
