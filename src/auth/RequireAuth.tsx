import React from 'react'
import { useAuth } from './AuthContext'

/**
 * The guard a future router would mount around the console. Loading and
 * anonymous both render the fallback: the front door is a safe place to stand
 * while a session is being read.
 */
export function RequireAuth({
  children,
  fallback,
}: {
  children: React.ReactNode
  fallback: React.ReactNode
}): React.ReactElement {
  const { status } = useAuth()
  return <>{status === 'authenticated' ? children : fallback}</>
}
