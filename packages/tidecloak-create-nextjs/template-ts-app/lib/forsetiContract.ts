// ─────────────────────────────────────────────────────────────────────────────
// The Forseti contract
//
// A Forseti contract is a small C# program that runs INSIDE every ORK node on the
// Tide network. It decides — cryptographically, with no single party able to
// override it — whether an encrypt or decrypt request is allowed to proceed.
//
// This single contract supports TWO access models (the client picks per request,
// via the data tags it sends — see app/encrypt/page.tsx):
//
//   1. OWNER-BOUND ("private to me"):
//      If the data carries an "owner:<id>" tag, the ciphertext is private to that
//      user. The contract requires the caller's network-asserted identity
//      (executor.UserId, taken from the doken the ORKs sign) to equal <id>.
//      The tag is just a label and could be faked, but the doken identity cannot —
//      so only the real owner can ever decrypt. This is "self-style" access, but
//      enforced by a policy contract (so you can layer extra rules on top).
//
//   2. ROLE-SHARED:
//      If there is no owner tag, the OPTIONAL EncryptionRealmRole / DecryptionRealmRole
//      params gate access by realm role — anyone holding the role may encrypt/decrypt.
//      If neither is set, any authenticated caller (past the voucher gate) may proceed.
//
// ValidateData() detects the direction, enforces PRIVATE execution, and reads the
// data tags out of the request payload. ValidateExecutor() applies the rules above.
//
// The contract's identity is the SHA-512 hash of this exact source string
// (see computeContractId below). Change a single character and the hash — and
// therefore the contract — changes. The policy references the contract by that hash.
// ─────────────────────────────────────────────────────────────────────────────

export const contract = `using Ork.Forseti.Sdk;
using Cryptide.Tools;
using Ork.Shared.Models.Contracts;
using System;
using System.Collections.Generic;
using System.Text;

public class Contract : IAccessPolicy
{
    [PolicyParam(Required = false, Description = "Realm role required to encrypt (role-shared mode)")]
    public string EncryptionRealmRole { get; set; }

    [PolicyParam(Required = false, Description = "Realm role required to decrypt (role-shared mode)")]
    public string DecryptionRealmRole { get; set; }

    private bool isEncryptionRequest = false;
    private List<string> DataTags = new();

    public PolicyDecision ValidateData(DataContext ctx)
    {
        if (ctx.RequestId == "PolicyEnabledEncryption:1")
            isEncryptionRequest = true;
        else if (ctx.RequestId == "PolicyEnabledDecryption:1")
            isEncryptionRequest = false;
        else
            return PolicyDecision.Deny("This contract only handles encryption/decryption requests");

        if (ctx.Policy.ExecutionType != ExecutionType.PRIVATE)
            return PolicyDecision.Deny("Policy must be PRIVATE so the executor is checked");

        // Read the data tags the client passed to doEncrypt/doDecrypt out of the
        // request payload. The encrypt and decrypt payloads are shaped slightly
        // differently, so the tag list starts at a different index for each.
        ReadOnlyMemory<byte> data = ctx.Data;
        if (isEncryptionRequest)
        {
            ReadOnlyMemory<byte> firstRequest = data.GetValue(1);
            for (int i = 2; firstRequest.TryGetValue(i, out var tag); i++)
                DataTags.Add(Encoding.UTF8.GetString(tag.Span));
        }
        else
        {
            ReadOnlyMemory<byte> firstRequest = data.GetValue(0);
            for (int i = 3; firstRequest.TryGetValue(i, out var tag); i++)
                DataTags.Add(Encoding.UTF8.GetString(tag.Span));
        }

        return PolicyDecision.Allow();
    }

    public PolicyDecision ValidateExecutor(ExecutorContext ctx)
    {
        var executor = new DokenDto(ctx.Doken);

        // ── Owner-bound (private) mode ───────────────────────────────────────
        // An "owner:<id>" tag means this ciphertext is private to that user.
        // Require the caller's doken identity to match. executor.UserId is signed
        // by the ORK network, so it cannot be forged — only the real owner passes.
        foreach (var tag in DataTags)
        {
            if (tag.StartsWith("owner:"))
            {
                var owner = tag.Substring("owner:".Length);
                return Decision
                    .RequireNotExpired(executor)
                    .Require(executor.UserId == owner, "You are not the owner of this data");
            }
        }

        // ── Role-shared mode ─────────────────────────────────────────────────
        if (isEncryptionRequest && EncryptionRealmRole != null)
            return Decision.RequireNotExpired(executor).RequireRole(executor, EncryptionRealmRole);

        if (!isEncryptionRequest && DecryptionRealmRole != null)
            return Decision.RequireNotExpired(executor).RequireRole(executor, DecryptionRealmRole);

        // No restriction configured for this operation — allow it.
        return PolicyDecision.Allow();
    }
}`;

// The contract id IS the SHA-512 hash (uppercase hex) of the contract source.
// The ORK network compares case-sensitively, so this must be uppercase.
export async function computeContractId(source: string): Promise<string> {
  const data = new TextEncoder().encode(source);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
