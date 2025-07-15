import { Provider } from './provider';

export const metadata = {
  title: 'My Tidecloak App',
  description: 'A Next.js starter with Tidecloak',
}

export default function RootLayout({ children }) {
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
