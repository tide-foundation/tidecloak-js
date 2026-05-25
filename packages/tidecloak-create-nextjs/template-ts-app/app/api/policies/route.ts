// ─────────────────────────────────────────────────────────────────────────────
// /api/policies — the server side of the policy lifecycle.
//
//   GET  /api/policies               -> pending policy requests (with commitReady flag)
//   GET  /api/policies?type=committed -> committed (signed) policies, ready to use
//   POST /api/policies               -> create | record a decision | commit
//   DELETE /api/policies             -> clear everything (demo "start again")
//
// The browser does the cryptographic work (signing happens in the admin's enclave);
// this route only persists bytes and asks @tideorg/js whether a request is ready
// to commit. See lib/policyStore.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import {
  createPolicyRequest,
  addPolicyDecision,
  commitPolicy,
  getPendingPolicies,
  getCommittedPolicies,
  clearAll,
} from "@/lib/policyStore";
import { base64ToBytes } from "@/lib/tideSerialization";

export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get("type") === "committed") {
      return NextResponse.json(getCommittedPolicies());
    }
    return NextResponse.json(await getPendingPolicies());
  } catch (err) {
    console.error("GET /api/policies failed:", err);
    return NextResponse.json({ error: `${err}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { policyRequest, decision, committed, requestedBy } = await req.json();

    if (committed) {
      // Step 3b: store the VVK signature against the policy.
      commitPolicy(committed.id, base64ToBytes(committed.signature));
    } else if (decision) {
      // Step 2b: record the admin's approve/deny of a pending request.
      addPolicyDecision(policyRequest, decision.rejected === true);
    } else {
      // Step 1b: store a freshly created (initialized) policy request.
      createPolicyRequest(policyRequest, requestedBy || "unknown");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/policies failed:", err);
    return NextResponse.json({ error: `${err}` }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    clearAll();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: `${err}` }, { status: 500 });
  }
}
