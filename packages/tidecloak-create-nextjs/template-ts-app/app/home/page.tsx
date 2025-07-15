'use client'

import { useTideCloak } from '@tidecloak/nextjs'
import { useState, useCallback, useEffect } from 'react'
import tcConfig from "../../tidecloak.json"


export default function HomePage() {
  const { logout, getValueFromIdToken, hasRealmRole, token } = useTideCloak()

  const [username, setUsername] = useState("")
  const [hasDefaultRole, setHasDefaultRole] = useState(false)
  const [verifyResult, setVerifyResult] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

    useEffect(() => {
    if (token) {
      const name = getValueFromIdToken("preferred_username")
      const defaultRole = hasRealmRole(`default-roles-${tcConfig["realm"]}`)
      setUsername(name);
      setHasDefaultRole(defaultRole)
    }

  }, [token])

  const onLogout = useCallback(() => {
    logout()
  }, [logout])

  const onVerify = useCallback(async () => {
    setVerifying(true)
    setVerifyResult(null)
    try {
      const res = await fetch('/api/protected', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (res.ok) {
        setVerifyResult(`✅ Authorized: vuid=${data.vuid}, key=${data.userkey}`)
      } else {
        setVerifyResult(`❌ ${res.status} - ${data.error || res.statusText}`)
      }
    } catch (err: any) {
      setVerifyResult(`❌ Network error: ${err.message}`)
    } finally {
      setVerifying(false)
    }
  }, [token])

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Hello, {username}!</h1>
        <p style={{ margin: '0.5rem 0', color: '#555' }}>
          Has default roles? <strong>{hasDefaultRole ? 'Yes' : 'No'}</strong>
        </p>

        <button onClick={onLogout} style={buttonStyle}>
          Log out
        </button>

        <button
          onClick={onVerify}
          style={{ ...buttonStyle, marginTop: '0.5rem' }}
          disabled={verifying}
        >
          {verifying ? 'Verifying…' : 'Verify Token'}
        </button>

        {verifyResult && (
          <p style={{ marginTop: '1rem', color: verifyResult.startsWith('✅') ? 'green' : 'red' }}>
            {verifyResult}
          </p>
        )}
      </div>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f5f5f5',
  margin: 0,
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  padding: '2rem',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  textAlign: 'center',
  maxWidth: '360px',
  width: '100%',
}

const buttonStyle: React.CSSProperties = {
  marginTop: '1rem',
  padding: '0.75rem 1.5rem',
  fontSize: '1rem',
  borderRadius: '4px',
  border: 'none',
  background: '#0070f3',
  color: '#fff',
  cursor: 'pointer',
}
