'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTideCloak } from '@tidecloak/nextjs'
import tcConfig from "../../tidecloak.json"

export default function HomePage() {
  const { logout, getValueFromIdToken, hasRealmRole, token, doEncrypt, doDecrypt } = useTideCloak()

  const [username, setUsername] = useState("")
  const [hasDefaultRole, setHasDefaultRole] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)
  const [verifying, setVerifying] = useState(false)

  // Self encrypt/decrypt: data is bound to THIS user's identity — only they can
  // decrypt it. The "message" tag matches the _tide_message.selfencrypt/.selfdecrypt
  // roles granted to every user in init/realm.json.
  const TAG = "message"
  const [plaintext, setPlaintext] = useState("")
  const [ciphertext, setCiphertext] = useState("")
  const [decrypted, setDecrypted] = useState("")
  const [busy, setBusy] = useState(null)
  const [cryptoErr, setCryptoErr] = useState("")

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
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok) {
        setVerifyResult(`✅ Authorized: vuid=${data.vuid}, key=${data.userkey}`)
      } else {
        setVerifyResult(`❌ ${res.status} - ${data.error || res.statusText}`)
      }
    } catch (err) {
      setVerifyResult(`❌ Network error: ${err.message}`)
    } finally {
      setVerifying(false)
    }
  }, [token])

  const onEncrypt = useCallback(async () => {
    if (!plaintext.trim()) return
    setBusy("enc"); setCryptoErr("")
    try {
      // doEncrypt takes an array of { data, tags } and returns ciphertext strings.
      const [c] = await doEncrypt([{ data: plaintext, tags: [TAG] }])
      setCiphertext(c); setDecrypted("")
    } catch (err) {
      setCryptoErr(err.message || "Encrypt failed")
    } finally {
      setBusy(null)
    }
  }, [plaintext, doEncrypt])

  const onDecrypt = useCallback(async () => {
    if (!ciphertext) return
    setBusy("dec"); setCryptoErr("")
    try {
      const [p] = await doDecrypt([{ encrypted: ciphertext, tags: [TAG] }])
      setDecrypted(String(p))
    } catch (err) {
      setCryptoErr(err.message || "Decrypt failed")
    } finally {
      setBusy(null)
    }
  }, [ciphertext, doDecrypt])

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
          <p
            style={{
              marginTop: '1rem',
              color: verifyResult.startsWith('✅') ? 'green' : 'red',
            }}
          >
            {verifyResult}
          </p>
        )}

        {/* ── Self encrypt / decrypt ─────────────────────────────────────── */}
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #eee', paddingTop: '1rem', textAlign: 'left' }}>
          <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.25rem' }}>Encrypt / decrypt</h2>
          <p style={{ margin: '0 0 0.5rem', color: '#777', fontSize: '0.85rem' }}>
            Encrypted under your own identity — only you can decrypt it.
          </p>

          <textarea
            value={plaintext}
            onChange={(e) => setPlaintext(e.target.value)}
            placeholder="Type something to encrypt…"
            style={textareaStyle}
          />
          <button onClick={onEncrypt} style={buttonStyle} disabled={!!busy}>
            {busy === 'enc' ? 'Encrypting…' : 'Encrypt'}
          </button>

          {ciphertext && (
            <>
              <p style={fieldLabel}>Ciphertext</p>
              <pre style={preStyle}>{ciphertext}</pre>
              <button onClick={onDecrypt} style={{ ...buttonStyle, marginTop: '0.5rem' }} disabled={!!busy}>
                {busy === 'dec' ? 'Decrypting…' : 'Decrypt'}
              </button>
            </>
          )}

          {decrypted && (
            <>
              <p style={fieldLabel}>Decrypted</p>
              <pre style={{ ...preStyle, background: '#e9f7ef' }}>{decrypted}</pre>
            </>
          )}

          {cryptoErr && <p style={{ color: 'red', marginTop: '0.5rem' }}>{cryptoErr}</p>}
        </div>
      </div>
    </div>
  )
}

const textareaStyle = {
  width: '100%',
  minHeight: '64px',
  padding: '0.5rem',
  borderRadius: '4px',
  border: '1px solid #ccc',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  fontSize: '0.9rem',
}

const fieldLabel = {
  margin: '0.75rem 0 0.25rem',
  fontSize: '0.8rem',
  color: '#555',
  fontWeight: 600,
}

const preStyle = {
  margin: 0,
  padding: '0.6rem',
  background: '#f4f4f4',
  borderRadius: '4px',
  fontSize: '0.8rem',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
}

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
  maxWidth: '660px',
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

