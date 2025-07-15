import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Provider } from './provider'

export const metadata: Metadata = {
  title: 'My Tidecloak App',
  description: 'A Next.js starter with Tidecloak',
}

interface RootLayoutProps {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en">
      <body>
        <Provider>
          {children}
        </Provider>
      </body>
    </html>
  )
}
