// Only reachable with a valid token: proxy.ts checks it before this page renders.
export default function ProtectedPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p>This page is protected server-side by proxy.ts.</p>
    </div>
  )
}
