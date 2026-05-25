// ─────────────────────────────────────────────────────────────────────────────
// Server-side policy store (DEMO: in-memory)
//
// A signed Forseti policy is needed by EVERY user who encrypts or decrypts, so it
// has to live on the server, not in one browser. This module keeps two collections:
//
//   • pending  — policy sign-requests that have been created but not yet committed.
//   • committed — fully VVK-signed policies, ready to be used for encrypt/decrypt.
//
// For clarity this uses plain in-memory Maps that reset when the dev server
// restarts. In a real app, replace these Maps with your database.
//
// This file is server-only: it talks to TideCloak's admin-policy endpoint
// (which the browser cannot reach cross-origin) and uses @tideorg/js to evaluate
// whether a pending request has gathered enough to be committed.
// ─────────────────────────────────────────────────────────────────────────────

import { Models, Contracts } from "@tideorg/js";
import { PolicySignRequest } from "heimdall-tide";
import { base64ToBytes, bytesToBase64 } from "./tideSerialization";
import tcConfig from "../tidecloak.json";

const Policy = Models.Policy;
const GenericResourceAccessThresholdRoleContract =
  Contracts.GenericResourceAccessThresholdRoleContract;

// id -> { id, requestedBy, data } (data = base64 of the PolicySignRequest bytes)
const pending = new Map();
// contractId -> base64 of the fully signed Policy bytes
const committed = new Map();

function authServerUrl() {
  return (tcConfig["auth-server-url"] || "").replace(/\/+$/, "");
}
function realm() {
  return tcConfig["realm"] || "";
}

// The "admin policy" is the realm's master policy. The ORKs require it to be
// attached to a sign-request before they will produce the final VVK signature.
// It is public (no auth) but must be fetched server-side to avoid CORS.
async function getAdminPolicy() {
  const url = `${authServerUrl()}/realms/${realm()}/tide-policy-resources/admin-policy`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch admin policy: ${await res.text()}`);
  // The endpoint returns base64 text — decode before parsing, never pass the text through.
  return Policy.from(base64ToBytes(await res.text()));
}

// ─── Create ──────────────────────────────────────────────────────────────────

export function createPolicyRequest(base64Request, requestedBy) {
  const req = PolicySignRequest.decode(base64ToBytes(base64Request));
  if (!req.isInitialized()) throw new Error("Policy request has not been initialized");
  const id = req.getUniqueId();
  pending.set(id, { id, requestedBy, data: base64Request });
}

// ─── Approve / deny ────────────────────────────────────────────────────────────

// `base64Request` here is the request AFTER the admin approved it in their enclave
// (it now carries the operator's approval). We just persist the updated bytes.
export function addPolicyDecision(base64Request, denied) {
  const req = PolicySignRequest.decode(base64ToBytes(base64Request));
  if (!req.isInitialized()) throw new Error("Policy request has not been initialized");
  const id = req.getUniqueId();
  const row = pending.get(id);
  if (!row) return;
  if (!denied) {
    row.data = bytesToBase64(req.encode());
  } else {
    pending.delete(id);
  }
}

// ─── List pending (and decide if ready to commit) ──────────────────────────────

export async function getPendingPolicies() {
  if (pending.size === 0) return [];
  const adminPolicy = await getAdminPolicy();

  const views = [];
  for (const row of pending.values()) {
    let commitReady = false;
    let data = row.data;
    let contractId;
    let modelId;

    try {
      const req = PolicySignRequest.decode(base64ToBytes(row.data));
      const policy = req.getRequestedPolicy();
      contractId = policy.contractId;
      modelId = policy.modelIds?.[0];

      // Ask @tideorg/js whether this request, combined with the realm's admin
      // policy, is ready to be committed. When it is, attach the admin policy
      // (the ORKs require it) and persist the augmented request.
      const master = new GenericResourceAccessThresholdRoleContract(req);
      const result = await master.testPolicy(adminPolicy);
      if (result.success) {
        commitReady = true;
        req.addPolicy(adminPolicy.toBytes());
        data = bytesToBase64(req.encode());
        pending.get(row.id).data = data;
      }
    } catch (e) {
      console.error("Error evaluating pending policy:", e);
    }

    views.push({ id: row.id, requestedBy: row.requestedBy, data, commitReady, contractId, modelId });
  }
  return views;
}

// ─── Commit ─────────────────────────────────────────────────────────────────

// `signature` is the VVK signature returned by executeSignRequest. We attach it
// to the policy, serialize the now fully-signed policy, and store it by contractId.
export function commitPolicy(id, signature) {
  const row = pending.get(id);
  if (!row) throw new Error("Unknown policy id");

  const req = PolicySignRequest.decode(base64ToBytes(row.data));
  const policy = req.getRequestedPolicy();
  policy.signature = signature;

  committed.set(policy.contractId, bytesToBase64(policy.toBytes()));
  pending.delete(id);
}

// ─── List committed (used by the encrypt/decrypt step) ─────────────────────────

export function getCommittedPolicies() {
  const out = [];
  for (const data of committed.values()) {
    try {
      const policy = Policy.from(base64ToBytes(data));
      const entries = policy.params?.entries;
      out.push({
        data,
        contractId: policy.contractId,
        encryptRole: entries?.get("EncryptionRealmRole") != null ? String(entries.get("EncryptionRealmRole")) : null,
        decryptRole: entries?.get("DecryptionRealmRole") != null ? String(entries.get("DecryptionRealmRole")) : null,
      });
    } catch (e) {
      console.error("Error decoding committed policy:", e);
    }
  }
  return out;
}

export function clearAll() {
  pending.clear();
  committed.clear();
}
