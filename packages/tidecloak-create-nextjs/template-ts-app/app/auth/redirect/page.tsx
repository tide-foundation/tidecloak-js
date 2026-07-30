'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTideCloak } from '@tidecloak/nextjs';

export default function RedirectPage() {
  const { authenticated, isInitializing, logout } = useTideCloak()
  const router = useRouter()
  // Generic landing message shown briefly after any login while auth resolves.
  // Overridden on the token-expiry failure path so we never claim success while
  // signing out.
  const [message, setMessage] = useState('Waiting for authentication...')

  // Handles redirect when middleware detects token expiry
  useEffect(() => {
    const doLogOut = async () => {
      logout();
    }

    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");

    if (auth === "failed") {
      setMessage('Signing you out...')
      sessionStorage.setItem("tokenExpired", "true");
      doLogOut();
    }
  }, [])

  useEffect(() => {
    if (!isInitializing) {
      router.push(authenticated ? '/home' : '/')
    }
  }, [authenticated, isInitializing, router])

  return (
    <div style={containerStyle}>
      <p>{message}</p>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1rem',
  color: '#555',
}
