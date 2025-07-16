import { TideCloakProvider } from "@tidecloak/nextjs";
import tcConfig from '../tidecloak.json';

export const metadata = {
  title: 'My Tidecloak App',
  description: 'A Next.js starter with Tidecloak',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <TideCloakProvider config={tcConfig}>
          {children}
        </TideCloakProvider>
      </body>
    </html>
  )
}
