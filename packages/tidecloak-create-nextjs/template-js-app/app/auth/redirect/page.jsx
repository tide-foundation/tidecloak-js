'use client'

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTideCloak } from '@tidecloak/nextjs';

export default function RedirectPage() {
  const { authenticated, isInitializing, logout } = useTideCloak()
  const router = useRouter()

  // Handles redirect when middleware detects token expiry
  useEffect(() => {
    const doLogOut = async () => {
      logout();
    }

    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");

    if (auth === "failed") {
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
      <p>Waiting for authentication...</p>
    </div>
  )
}

const containerStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1rem',
  color: '#555',
}
