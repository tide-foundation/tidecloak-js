'use client'

import { useTideCloak } from '@tidecloak/nextjs'
import { useState, useCallback, useEffect } from 'react'
import tcConfig from "../../tidecloak.json"


export default function HomePage() {
  const { logout, getValueFromIdToken, hasRealmRole, token, doEncrypt, doDecrypt } = useTideCloak()

  const [username, setUsername] = useState("")
  const [hasDefaultRole, setHasDefaultRole] = useState(false)
  const [verifyResult, setVerifyResult] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  // Self encrypt/decrypt: data is bound to THIS user's identity — only they can
  // decrypt it. The "message" tag matches the _tide_message.selfencrypt/.selfdecrypt
  // roles granted to every user in init/realm.json.
  const TAG = "message"
  const [text, setText] = useState("")        // always the decrypted value, editable
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [cryptoErr, setCryptoErr] = useState("")

  // localStorage key for the saved note, namespaced per user (vuid).
  const storageKey = () => `tide-note:${getValueFromIdToken("vuid")}`

  useEffect(() => {
    if (token) {
      const name = getValueFromIdToken("preferred_username")
      const defaultRole = hasRealmRole(`default-roles-${tcConfig["realm"]}`)
      setUsername(name);
      setHasDefaultRole(defaultRole)

      // Restore the saved note. Only the CIPHERTEXT is persisted; we decrypt it
      // client-side here so the field shows plaintext when you log back in.
      const stored = typeof window !== "undefined" ? localStorage.getItem(storageKey()) : null
      if (stored) {
        doDecrypt([{ encrypted: stored, tags: [TAG] }])
          .then((res) => setText(String(res[0])))
          .catch(() => {})
      }
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

  // Submit = encrypt the current value, persist the ciphertext, then decrypt it
  // straight back so the field keeps showing plaintext. We store only the
  // ciphertext (here in localStorage; in a real app, on your server) — it's
  // decrypted again when you log back in.
  const onSubmit = useCallback(async () => {
    setBusy(true); setCryptoErr(""); setStatus("")
    try {
      const [ct] = await doEncrypt([{ data: text, tags: [TAG] }])
      if (typeof window !== "undefined") localStorage.setItem(storageKey(), ct)
      const [pt] = await doDecrypt([{ encrypted: ct, tags: [TAG] }])
      setText(String(pt))
      setStatus("Message successfully stored")
    } catch (err: any) {
      setCryptoErr(err.message || "Failed")
    } finally {
      setBusy(false)
    }
  }, [text, doEncrypt, doDecrypt])

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

        {/* ── Encrypted note: always shown decrypted; Submit re-encrypts then decrypts ── */}
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #eee', paddingTop: '1rem', textAlign: 'left' }}>
          <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.25rem' }}>Your encrypted note</h2>
          <p style={{ margin: '0 0 0.5rem', color: '#777', fontSize: '0.85rem' }}>
            This is an encrypted textbox under your own identity — only you can decrypt it.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your note…"
            style={textareaStyle}
          />
          <button onClick={onSubmit} style={buttonStyle} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit'}
          </button>

          {status && <p style={{ color: 'green', marginTop: '0.5rem', fontSize: '0.85rem' }}>{status}</p>}

          {cryptoErr && <p style={{ color: 'red', marginTop: '0.5rem' }}>{cryptoErr}</p>}
        </div>
      </div>
    </div>
  )
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '64px',
  padding: '0.5rem',
  borderRadius: '4px',
  border: '1px solid #ccc',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  fontSize: '0.9rem',
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
  maxWidth: '660px',
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

