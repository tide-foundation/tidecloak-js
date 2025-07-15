'use client'

import { useCallback, useEffect } from 'react'
import { useTideCloak } from '@tidecloak/nextjs'
import { useRouter } from 'next/navigation'

const containerStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f5f5f5',
  margin: 0,
}

const cardStyle = {
  background: '#fff',
  padding: '2rem',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  textAlign: 'center',
  maxWidth: '360px',
  width: '100%',
}

const buttonStyle = {
  marginTop: '1rem',
  padding: '0.75rem 1.5rem',
  fontSize: '1rem',
  borderRadius: '4px',
  border: 'none',
  background: '#0070f3',
  color: '#fff',
  cursor: 'pointer',
}

export default function LoginPage() {
  const { login, authenticated } = useTideCloak()
  const router = useRouter()

  const onLogin = useCallback(() => {
    login()
  }, [login])

  useEffect(() => {
    if (authenticated) {
      router.push('/home')
    }
  }, [authenticated, router])

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Welcome!</h1>
        <p style={{ color: '#555', marginTop: '0.5rem' }}>
          Please log in to continue.
        </p>
        <button onClick={onLogin} style={buttonStyle}>
          Log In
        </button>
      </div>
    </div>
  )
}
