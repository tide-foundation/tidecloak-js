'use client'

import React, { type ReactNode } from 'react'
import {
  TideCloakProvider,
  type TideCloakConfig,
} from '@tidecloak/nextjs'
import tcConfig from '../tidecloak.json'

interface ProviderProps {
  children: ReactNode
}

export function Provider({ children }: ProviderProps): JSX.Element {
  // If tidecloak.json isn’t already typed, you can cast it:
  const config = tcConfig as unknown as TideCloakConfig

  return (
    <TideCloakProvider config={config}>
      {children}
    </TideCloakProvider>
  )
}
