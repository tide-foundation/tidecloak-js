'use client'

import React, { type ReactNode } from 'react'
import {
  TideCloakProvider
} from '@tidecloak/nextjs'
import tcConfig from '../tidecloak.json'

interface ProviderProps {
  children: ReactNode
}

export function Provider({ children }: ProviderProps) {
  // If tidecloak.json isn’t already typed, you can cast it:
  const config = tcConfig

  return (
    <TideCloakProvider config={config}>
      {children}
    </TideCloakProvider>
  )
}
