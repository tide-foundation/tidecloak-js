'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Policy-governed encryption demo
//
// This page shows the FULL lifecycle of Tide "policy-governed" (a.k.a. VVK)
// encryption — encryption whose access rules are enforced by a Forseti contract
// running on the Tide ORK network, rather than being bound to a single user.
//
// It is intentionally different from "self-encryption" (doEncrypt/doDecrypt with
// no policy), where only the user who encrypted can ever decrypt. Here, ANY user
// whose token satisfies the contract's rules can decrypt.
//
// The lifecycle has three stages:
//
//   1. Authenticate (handled by TideCloak — you're already logged in to reach here)
//   2. Set up the policy (admin only, one-time):
//        a. CREATE  — build a Policy + Forseti contract, initialize the sign request
//        b. APPROVE — the admin approves it in the Tide enclave popup
//        c. COMMIT  — execute the sign request to get the VVK signature, store it
//   3. Encrypt / decrypt using the committed, signed policy
//
// All the cryptographic steps go through the SAME IAMService the TideCloakProvider
// initialized — we get it straight from useTideCloak() so there's only ever one
// instance. The signing primitives (Policy / PolicySignRequest) come from
// @tideorg/js and heimdall-tide, because @tidecloak/nextjs does not export them.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTideCloak } from '@tidecloak/nextjs'
import { Models } from '@tideorg/js'
import { PolicySignRequest } from 'heimdall-tide'
import { contract, computeContractId } from '@/lib/forsetiContract'
import { bytesToBase64, base64ToBytes } from '@/lib/tideSerialization'

const { Policy, ApprovalType, ExecutionType } = Models

// One row of the setup flow. `state` controls the look: done (green ✓),
// active (blue, current step), or locked (greyed, not yet reachable).
function StepRow({ n, title, desc, state, children }) {
  const badge = state === 'done' ? badgeDone : state === 'active' ? badgeActive : badgeLocked
  return (
    <div style={{ ...stepRow, opacity: state === 'locked' ? 0.5 : 1 }}>
      <span style={badge}>{state === 'done' ? '✓' : n}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{title}</div>
        <div style={subtle}>{desc}</div>
        {children}
      </div>
    </div>
  )
}

export default function EncryptPage() {
  const {
    authenticated, isInitializing, logout, getValueFromIdToken, getValueFromToken,
    // Tide helpers exposed by the provider (all backed by the one IAMService):
    IAMService, initializeTideRequest, approveTideRequests, getVendorId,
  } = useTideCloak()
  const router = useRouter()

  // The contract id is the SHA-512 of the contract source. It links a Policy to
  // this exact contract, and we use it to find our committed policy on the server.
  const [contractId, setContractId] = useState('')

  // Optional realm-role restrictions, bound into the policy at creation time.
  const [encryptRole, setEncryptRole] = useState('')
  const [decryptRole, setDecryptRole] = useState('')

  const [pending, setPending] = useState([])
  const [policyBytes, setPolicyBytes] = useState(null)
  const [committedRoles, setCommittedRoles] = useState(null)

  // A "tag" is opaque metadata attached to the ciphertext. The SAME tag must be
  // supplied when decrypting. We keep one shared tag for the demo.
  const [tag, setTag] = useState('default')

  // Owner-bound ("private to me") mode. When on, we add an `owner:<my-vuid>` tag.
  // The contract then requires the caller's doken identity to equal that vuid, so
  // only this account can ever decrypt — even other holders of the policy can't.
  const [privateMode, setPrivateMode] = useState(true)
  const [plaintext, setPlaintext] = useState('')
  const [ciphertext, setCiphertext] = useState('')
  const [decryptInput, setDecryptInput] = useState('')
  const [decrypted, setDecrypted] = useState('')

  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const note = (text, type = 'info') => setMsg({ text, type })

  const policyReady = policyBytes !== null

  // ─── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isInitializing && !authenticated) router.push('/')
  }, [authenticated, isInitializing, router])

  useEffect(() => {
    computeContractId(contract).then(setContractId)
  }, [])

  useEffect(() => {
    if (authenticated && contractId) refresh()
  }, [authenticated, contractId])

  async function refresh() {
    try {
      const [pendingRes, committedRes] = await Promise.all([
        fetch('/api/policies').then((r) => r.json()),
        fetch('/api/policies?type=committed').then((r) => r.json()),
      ])
      setPending(Array.isArray(pendingRes) ? pendingRes : [])

      // Find the committed policy that matches OUR contract.
      const mine = committedRes.find((p) => p.contractId === contractId)
      if (mine) {
        setPolicyBytes(base64ToBytes(mine.data))
        setCommittedRoles({ encryptRole: mine.encryptRole, decryptRole: mine.decryptRole })
      } else {
        setPolicyBytes(null)
        setCommittedRoles(null)
      }
    } catch (e) {
      console.error(e)
    }
  }

  // ─── Step 2a: Create the policy ──────────────────────────────────────────────

  async function handleCreate() {
    setBusy('create')
    try {
      note('Building and initializing the policy sign-request...')

      // Bind the optional role restrictions as policy params. The contract reads
      // these by name (EncryptionRealmRole / DecryptionRealmRole).
      const params = new Map()
      if (encryptRole.trim()) params.set('EncryptionRealmRole', encryptRole.trim())
      if (decryptRole.trim()) params.set('DecryptionRealmRole', decryptRole.trim())

      const policy = new Policy({
        version: '3',
        // The ORK request types this policy is allowed to govern (array, not "any").
        modelId: ['PolicyEnabledEncryption:1', 'PolicyEnabledDecryption:1'],
        contractId,
        keyId: getVendorId(), // vendorId from the adapter config
        executionType: ExecutionType.PRIVATE, // run ValidateExecutor against the caller
        approvalType: ApprovalType.IMPLICIT,   // no separate approver step needed
        params,
      })

      const request = PolicySignRequest.New(policy)
      request.addForsetiContractToUpload(contract) // upload the C# source with the request
      request.setCustomExpiry(604800) // 1 week

      // initializeTideRequest runs createTideRequest under the hood and returns the
      // re-decoded request, ready to be stored / approved.
      const initialized = await initializeTideRequest(request)

      await postJson({ policyRequest: bytesToBase64(initialized.encode()), requestedBy: getValueFromIdToken('vuid') })
      note('Policy created. Now approve it (Step 2b).', 'success')
      await refresh()
    } catch (e) {
      note(`Create failed: ${e.message}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  // ─── Step 2b: Approve the policy (enclave popup) ─────────────────────────────

  async function handleApprove(p) {
    setBusy('approve')
    try {
      note('Opening the Tide approval enclave...')
      const req = PolicySignRequest.decode(base64ToBytes(p.data))
      const [result] = await approveTideRequests([{ id: p.id, request: req.encode() }])

      if (result.approved) {
        await postJson({ policyRequest: bytesToBase64(result.approved.request), decision: { rejected: false } })
        note('Approved. Now commit it (Step 2c).', 'success')
      } else if (result.denied) {
        await postJson({ policyRequest: bytesToBase64(req.encode()), decision: { rejected: true } })
        note('Policy denied.', 'error')
      } else {
        note('Approval still pending.')
      }
      await refresh()
    } catch (e) {
      note(`Approve failed: ${e.message}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  // ─── Step 2c: Commit (produce the VVK signature) ─────────────────────────────

  async function handleCommit(p) {
    setBusy('commit')
    try {
      note('Executing the sign request on the Tide network...')
      const req = PolicySignRequest.decode(base64ToBytes(p.data))
      // executeSignRequest isn't on the hook — reach it via the shared IAMService.
      const signatures = await IAMService._tc.executeSignRequest(req.encode(), true)
      await postJson({ committed: { id: p.id, signature: bytesToBase64(signatures[0]) } })
      note('Policy committed! You can now encrypt and decrypt below.', 'success')
      await refresh()
    } catch (e) {
      note(`Commit failed: ${e.message}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  // ─── Step 3: Encrypt / decrypt with the signed policy ────────────────────────

  // The tags sent to encrypt/decrypt. In private mode we prepend `owner:<my-vuid>`
  // (the vendor user id claim from the token) — the SAME tags must be used to
  // decrypt, which is why one toggle drives both operations.
  function effectiveTags() {
    const base = tag.trim() || 'default'
    if (privateMode) {
      const vuid = getValueFromToken('vuid')
      return [`owner:${vuid}`, base]
    }
    return [base]
  }

  async function handleEncrypt() {
    if (!plaintext.trim() || !policyBytes) return
    setBusy('encrypt')
    try {
      // The second argument is what makes this POLICY-governed encryption.
      // Without it, doEncrypt would fall back to self-encryption.
      const results = await IAMService.doEncrypt(
        [{ data: plaintext, tags: effectiveTags() }],
        policyBytes,
      )
      setCiphertext(results[0])
      setDecryptInput(results[0]) // prefill so you can round-trip immediately
      setDecrypted('')
      note('Encrypted.', 'success')
    } catch (e) {
      note(`Encrypt failed: ${e.message}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleDecrypt() {
    if (!decryptInput.trim() || !policyBytes) return
    setBusy('decrypt')
    try {
      const results = await IAMService.doDecrypt(
        [{ encrypted: decryptInput, tags: effectiveTags() }],
        policyBytes,
      )
      setDecrypted(String(results[0]))
      note('Decrypted.', 'success')
    } catch (e) {
      note(`Decrypt failed: ${e.message}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleStartAgain() {
    await fetch('/api/policies', { method: 'DELETE' }).catch(() => {})
    setPolicyBytes(null); setCommittedRoles(null); setPending([])
    setEncryptRole(''); setDecryptRole('')
    setPlaintext(''); setCiphertext(''); setDecryptInput(''); setDecrypted('')
    setMsg(null)
    await refresh()
  }

  async function postJson(body) {
    const res = await fetch('/api/policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json()).error || 'Request failed')
  }

  if (isInitializing) return <div style={page}><p>Loading…</p></div>
  if (!authenticated) return <div style={page}><p>Redirecting…</p></div>

  // Derive the setup progress so each sub-step locks until the previous is done.
  const p = pending[0]
  const created = pending.length > 0 || policyReady
  const approved = (p?.commitReady ?? false) || policyReady // server marks commitReady once approved
  const committed = policyReady

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Policy-governed encryption</h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <a href="/home" style={{ ...ghostBtn, textDecoration: 'none' }}>← Home</a>
            <button onClick={() => logout()} style={ghostBtn}>Log out</button>
          </div>
        </div>
        <p style={{ ...subtle, marginTop: '0.25rem' }}>
          Encrypt data whose access is enforced by a Forseti contract on the Tide network,
          rather than tied to one user. Set the policy up once, then encrypt/decrypt below.
        </p>

        {msg && (
          <p style={{ ...banner, ...(msg.type === 'error' ? bannerErr : msg.type === 'success' ? bannerOk : {}) }}>
            {msg.text}
          </p>
        )}

        {/* ── Step 2: set up the policy ─────────────────────────────────────── */}
        <section style={section}>
          <h2 style={h2}>1 · Set up the encryption policy <span style={subtle}>(admin, one-time)</span></h2>

          {policyReady ? (
            <p style={okText}>
              ✅ Policy committed and active.
              {committedRoles?.encryptRole && <> Encrypt requires role <code>{committedRoles.encryptRole}</code>.</>}
              {committedRoles?.decryptRole && <> Decrypt requires role <code>{committedRoles.decryptRole}</code>.</>}
            </p>
          ) : (
            <>
              {/* Role options are bound when the policy is created, so only show them first. */}
              {!created && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <p style={subtle}>Optionally restrict to a realm role (blank = any signed-in user):</p>
                  <label style={label}>Encrypt role (optional)
                    <input style={input} value={encryptRole} onChange={(e) => setEncryptRole(e.target.value)} placeholder="e.g. appUser" />
                  </label>
                  <label style={label}>Decrypt role (optional)
                    <input style={input} value={decryptRole} onChange={(e) => setDecryptRole(e.target.value)} placeholder="e.g. appUser" />
                  </label>
                </div>
              )}

              <StepRow n={1} title="Create policy" desc="Bundles the Forseti contract with your settings."
                state={created ? 'done' : 'active'}>
                {!created && (
                  <button onClick={handleCreate} disabled={!!busy} style={primaryBtn}>
                    {busy === 'create' ? 'Creating…' : 'Create policy'}
                  </button>
                )}
              </StepRow>

              <StepRow n={2} title="Approve in enclave" desc="Opens the Tide popup for the admin to sign."
                state={approved ? 'done' : created ? 'active' : 'locked'}>
                {created && !approved && (
                  <button onClick={() => handleApprove(p)} disabled={!!busy} style={primaryBtn}>
                    {busy === 'approve' ? 'Approving…' : 'Approve'}
                  </button>
                )}
              </StepRow>

              <StepRow n={3} title="Commit to network" desc="Publishes the signed policy to the ORK network."
                state={committed ? 'done' : approved ? 'active' : 'locked'}>
                {/* Greyed and disabled until the policy is approved. */}
                <button
                  onClick={() => p && handleCommit(p)}
                  disabled={!!busy || !approved}
                  style={approved ? primaryBtn : disabledBtn}
                  title={approved ? '' : 'Approve the policy first'}
                >
                  {busy === 'commit' ? 'Committing…' : 'Commit to network'}
                </button>
              </StepRow>
            </>
          )}
        </section>

        {/* ── Step 3: encrypt / decrypt ─────────────────────────────────────── */}
        <section style={{ ...section, opacity: policyReady ? 1 : 0.5, pointerEvents: policyReady ? 'auto' : 'none' }}>
          <h2 style={h2}>2 · Encrypt &amp; decrypt</h2>

          <label style={{ ...label, display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
            <input type="checkbox" checked={privateMode} onChange={(e) => setPrivateMode(e.target.checked)} />
            🔒 Private to me — only my account can decrypt (adds an <code>owner:&lt;vuid&gt;</code> tag)
          </label>
          <p style={subtle}>
            {privateMode
              ? 'The contract requires the caller’s vuid to match the owner tag. Even another holder of this policy cannot decrypt your data.'
              : 'Role-shared: anyone allowed by the policy can decrypt.'}
          </p>

          <label style={label}>Tag (must match on encrypt and decrypt)
            <input style={input} value={tag} onChange={(e) => setTag(e.target.value)} />
          </label>

          <label style={label}>Plaintext
            <textarea style={textarea} value={plaintext} onChange={(e) => setPlaintext(e.target.value)} placeholder="Type a secret…" />
          </label>
          <button onClick={handleEncrypt} disabled={!!busy} style={primaryBtn}>
            {busy === 'encrypt' ? 'Encrypting…' : 'Encrypt'}
          </button>
          {ciphertext && <pre style={pre}>{ciphertext}</pre>}

          <label style={{ ...label, marginTop: '1rem' }}>Ciphertext to decrypt
            <textarea style={textarea} value={decryptInput} onChange={(e) => setDecryptInput(e.target.value)} />
          </label>
          <button onClick={handleDecrypt} disabled={!!busy} style={primaryBtn}>
            {busy === 'decrypt' ? 'Decrypting…' : 'Decrypt'}
          </button>
          {decrypted && <pre style={{ ...pre, background: '#e9f7ef' }}>{decrypted}</pre>}
        </section>

        <button onClick={handleStartAgain} style={{ ...ghostBtn, marginTop: '1rem' }}>Start again (clear policies)</button>
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const page = { minHeight: '100vh', display: 'flex', justifyContent: 'center', background: '#f5f5f5', padding: '2rem' }
const card = { background: '#fff', padding: '2rem', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: 640, width: '100%' }
const section = { borderTop: '1px solid #eee', marginTop: '1.25rem', paddingTop: '1.25rem' }
const h2 = { fontSize: '1.05rem', margin: '0 0 0.5rem' }
const subtle = { color: '#777', fontSize: '0.85rem', fontWeight: 400 }
const okText = { color: '#176c3a', fontSize: '0.95rem' }
const label = { display: 'block', fontSize: '0.85rem', color: '#444', marginTop: '0.6rem' }
const input = { display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.25rem', borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' }
const textarea = { ...input, minHeight: 64, fontFamily: 'inherit' }
const primaryBtn = { marginTop: '0.75rem', padding: '0.6rem 1.1rem', fontSize: '0.95rem', borderRadius: 4, border: 'none', background: '#0070f3', color: '#fff', cursor: 'pointer' }
const disabledBtn = { ...primaryBtn, background: '#cfcfcf', color: '#fff', cursor: 'not-allowed' }
const ghostBtn = { padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderRadius: 4, border: '1px solid #ccc', background: '#fff', color: '#333', cursor: 'pointer' }
const stepRow = { display: 'flex', gap: '0.7rem', alignItems: 'flex-start', padding: '0.6rem 0', borderTop: '1px solid #f0f0f0' }
const badgeBase = { flex: '0 0 auto', width: 24, height: 24, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#fff', marginTop: 2 }
const badgeDone = { ...badgeBase, background: '#1a9c4e' }
const badgeActive = { ...badgeBase, background: '#0070f3' }
const badgeLocked = { ...badgeBase, background: '#bbb' }
const banner = { marginTop: '1rem', padding: '0.6rem 0.8rem', borderRadius: 4, background: '#eef3ff', fontSize: '0.9rem' }
const bannerErr = { background: '#fdecea', color: '#a32219' }
const bannerOk = { background: '#e9f7ef', color: '#176c3a' }
const pre = { marginTop: '0.5rem', padding: '0.6rem', background: '#f4f4f4', borderRadius: 4, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }
