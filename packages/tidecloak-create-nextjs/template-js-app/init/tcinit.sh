#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
#  @tidecloak/create-nextjs - tcinit.sh (SHIPPED template copy)
#
#  Provisions a firstAdmin / threshold-1 Tide realm for a Next.js app, driving
#  the CURRENT iga-core native governance model (drain PENDING change-requests
#  via /iga/change-requests/{id}/approve, which records AND auto-commits at
#  threshold-1). The legacy tide-admin/change-set/{type}/sign|commit path has
#  been removed.
#
#  This copy ships inside the scaffolded app so the user can re-run:
#      cd <app> && bash init/tcinit.sh
#  It resolves everything relative to SCRIPT_DIR and is runnable from anywhere.
#
#  The governance body below (from "Helper: grab a fresh master admin-cli
#  token" onward) is IDENTICAL to the canonical init/tcinit.sh. Both are kept
#  in sync via `npm run sync:init`. Only this path/bootstrap preamble differs.
# ─────────────────────────────────────────────────────────────────────────────

# ─── Resolve script directory (run from anywhere) ────────────────────────────
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"

# ─── Load defaults from .env.example (CRLF-safe) ─────────────────────────────
# -f guard keeps it a no-op when absent.
ENV_FILE="${SCRIPT_DIR}/.env.example"
if [[ -f "$ENV_FILE" ]]; then
  # Apply each KEY=VALUE from the defaults file with FALLBACK semantics: a
  # variable already present in the caller's environment is preserved and the
  # default is ignored. We deliberately do NOT `source` the file, because raw
  # assignments would hard-override caller-supplied env (e.g. NEW_REALM_NAME).
  # CRLF-safe: a trailing CR is stripped from every line.
  while IFS= read -r _env_line || [[ -n "$_env_line" ]]; do
    _env_line="${_env_line%$'\r'}"
    if [[ "$_env_line" =~ ^[[:space:]]*(#|$) ]]; then
      continue
    fi
    if [[ "$_env_line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
      _env_key="${BASH_REMATCH[2]}"
      _env_val="${BASH_REMATCH[3]}"
      _env_val="${_env_val#"${_env_val%%[![:space:]]*}"}"
      _env_val="${_env_val%"${_env_val##*[![:space:]]}"}"
      if [[ ${#_env_val} -ge 2 && "$_env_val" == \"*\" ]]; then
        _env_val="${_env_val:1:${#_env_val}-2}"
      elif [[ ${#_env_val} -ge 2 && "$_env_val" == \'*\' ]]; then
        _env_val="${_env_val:1:${#_env_val}-2}"
      fi
      if [[ -z "${!_env_key:-}" ]]; then
        printf -v "$_env_key" '%s' "$_env_val"
      fi
    fi
  done < "$ENV_FILE"
  unset _env_line _env_key _env_val
fi

# ─── Defaults (override via env) ─────────────────────────────────────────────
TIDECLOAK_LOCAL_URL="${TIDECLOAK_LOCAL_URL:-http://localhost:8080}"
CLIENT_APP_URL="${CLIENT_APP_URL:-http://localhost:3000}"
NEW_REALM_NAME="${NEW_REALM_NAME:-nextjs-test}"
REALM_MGMT_CLIENT_ID="${REALM_MGMT_CLIENT_ID:-realm-management}"
ADMIN_ROLE_NAME="${ADMIN_ROLE_NAME:-tide-realm-admin}"
KC_USER="${KC_USER:-admin}"
KC_PASSWORD="${KC_PASSWORD:-password}"
CLIENT_NAME="${CLIENT_NAME:-myclient}"
SUBSCRIPTION_EMAIL="${SUBSCRIPTION_EMAIL:-test@demo.org}"
ADAPTER_OUTPUT_PATH="${ADAPTER_OUTPUT_PATH:-${SCRIPT_DIR}/tidecloak.json}"
MARKER_DIR="${SCRIPT_DIR}"

# ─── Find realm.json robustly ────────────────────────────────────────────────
# Priority: env → same dir → parent → current working dir
CANDIDATES=()
[[ "${REALM_JSON_PATH:-}" != "" ]] && CANDIDATES+=("${REALM_JSON_PATH}")
CANDIDATES+=("${SCRIPT_DIR}/realm.json" "${SCRIPT_DIR}/../realm.json" "$(pwd)/realm.json")

REALM_JSON_PATH=""
for p in "${CANDIDATES[@]}"; do
  if [[ -f "$p" ]]; then REALM_JSON_PATH="$p"; break; fi
done

if [[ -z "${REALM_JSON_PATH}" ]]; then
  echo "ERROR: Could not find realm.json in:" >&2
  for p in "${CANDIDATES[@]}"; do echo "   - $p" >&2; done
  echo "   Put realm.json next to the script (${SCRIPT_DIR}/realm.json)" >&2
  echo "   OR run with: REALM_JSON_PATH=/abs/path/realm.json bash init/tcinit.sh" >&2
  exit 1
fi
echo "Using realm.json: ${REALM_JSON_PATH}"

# ─── Dependency checks ───────────────────────────────────────────────────────
need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need_cmd curl
need_cmd jq
need_cmd sed
need_cmd mktemp

# ─── sed -i portability ──────────────────────────────────────────────────────
if sed --version >/dev/null 2>&1; then SED_INPLACE=(-i); else SED_INPLACE=(-i ''); fi

# ─── Cleanup handler ─────────────────────────────────────────────────────────
# INCOMPLETE_FIRSTADMIN is set to 1 once IGA is enabled (step 4) and cleared
# back to 0 after the final grant+flip (step 14) completes. If the script exits
# non-zero while this flag is set, the realm is half-provisioned (IGA on, admin
# not yet granted/flipped) and we warn loudly. We do NOT auto-delete the realm.
TMP_REALM_JSON=""
INCOMPLETE_FIRSTADMIN=0
cleanup() {
  local rc=$?
  [[ -n "${TMP_REALM_JSON}" && -f "${TMP_REALM_JSON}" ]] && rm -f "${TMP_REALM_JSON}" || true
  [[ -f "${MARKER_DIR}/.realm_name" ]] && rm -f "${MARKER_DIR}/.realm_name" || true
  if [[ "${rc}" != "0" && "${INCOMPLETE_FIRSTADMIN}" == "1" ]]; then
    echo "" >&2
    echo "──────────────────────────────────────────────────────────────────────" >&2
    echo "WARNING: realm '${REALM_NAME:-?}' may be left in an incomplete firstAdmin" >&2
    echo "         state (IGA enabled, admin not yet granted/flipped)." >&2
    echo "         Complete provisioning or delete the realm before use." >&2
    echo "──────────────────────────────────────────────────────────────────────" >&2
  fi
}
trap cleanup EXIT

# ─── Plaintext-to-remote credential warning (non-fatal) ──────────────────────
# TIDECLOAK_LOCAL_URL is resolved in the preamble above. If we are about to send
# admin credentials and bearer tokens over cleartext http:// to a NON-loopback
# host, warn the user. Loopback http:// stays silent; https:// stays silent.
case "${TIDECLOAK_LOCAL_URL}" in
  http://localhost|http://localhost:*|http://localhost/*)   : ;;
  http://127.0.0.1|http://127.0.0.1:*|http://127.0.0.1/*)   : ;;
  http://\[::1\]|http://\[::1\]:*|http://\[::1\]/*)         : ;;
  http://*)
    echo "WARNING: TIDECLOAK_LOCAL_URL='${TIDECLOAK_LOCAL_URL}' uses cleartext http:// to a non-loopback host." >&2
    echo "         Admin credentials and bearer tokens will be sent UNENCRYPTED over the network." >&2
    echo "         Use an https:// URL when targeting a remote TideCloak." >&2
    ;;
esac

# ─────────────────────────────────────────────────────────────────────────────
#  Helper: grab a fresh master admin-cli token (master realm password grant)
# ─────────────────────────────────────────────────────────────────────────────
get_admin_token() {
  curl -s -X POST "${TIDECLOAK_LOCAL_URL}/realms/master/protocol/openid-connect/token" \
       -H "Content-Type: application/x-www-form-urlencoded" \
       -d "username=${KC_USER}" \
       -d "password=${KC_PASSWORD}" \
       -d "grant_type=password" \
       -d "client_id=admin-cli" \
    | jq -r .access_token
}

# ─────────────────────────────────────────────────────────────────────────────
#  Helper: status-capturing admin API call.
#  Usage:  api METHOD URL [extra curl args...]
#          then read the results from the globals it sets:
#            RESP_CODE  - the HTTP status ("000" on hard network failure)
#            RESP_BODY  - the full response body
#  IMPORTANT: call api WITHOUT command substitution. It sets globals in the
#  CURRENT shell; running it as `code=$(api ...)` would execute it in a subshell
#  and the RESP_BODY/RESP_CODE it sets would be discarded before the parent
#  could read them.
#  - Authorization: Bearer ${TOKEN} is added automatically (refresh TOKEN first).
#  - Never aborts the script on a non-2xx HTTP response (curl -s exits 0);
#    only a hard network failure yields RESP_CODE "000".
# ─────────────────────────────────────────────────────────────────────────────
RESP_CODE=""
RESP_BODY=""
api() {
  local method="$1" url="$2"; shift 2
  local tmp
  tmp="$(mktemp)"
  RESP_CODE=$(curl -s -o "${tmp}" -w "%{http_code}" -X "${method}" "${url}" \
           -H "Authorization: Bearer ${TOKEN}" "$@") || RESP_CODE="000"
  RESP_BODY="$(cat "${tmp}")"
  rm -f "${tmp}"
}

# ─────────────────────────────────────────────────────────────────────────────
#  Drain PENDING IGA change-requests (current iga-core native governance).
#  LIST returns a bare JSON array; per-item id = .id; /approve body = {}
#  (application/json). At threshold-1 /approve records AND auto-commits, so
#  there is no separate /commit. Loop-until-empty is required because approving
#  one CR unblocks its dependents.
# ─────────────────────────────────────────────────────────────────────────────
drain_change_requests() {
  local label="${1:-}" rounds=0
  echo "Draining PENDING change-requests ${label}..."
  while (( rounds < 12 )); do
    TOKEN="$(get_admin_token)"
    local list_tmp list_code
    list_tmp="$(mktemp)"
    list_code=$(curl -s -o "${list_tmp}" -w "%{http_code}" \
      "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/iga/change-requests?status=PENDING" \
      -H "Authorization: Bearer ${TOKEN}" -H "Cache-Control: no-store") || list_code="000"
    if [[ "${list_code}" == "401" || "${list_code}" == "403" ]]; then
      rm -f "${list_tmp}"
      echo "FATAL: change-request LIST returned HTTP ${list_code} ${label} - admin authentication/authorization failed." >&2
      echo "       Refusing to treat an auth failure as an empty inbox. Check KC_USER/KC_PASSWORD and admin privileges." >&2
      exit 1
    fi
    ids=$(jq -r '.[].id // empty' < "${list_tmp}")
    rm -f "${list_tmp}"
    if [[ -z "${ids}" ]]; then echo "  inbox empty ${label}"; return 0; fi
    while IFS= read -r id; do
      [[ -z "$id" ]] && continue
      st=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/iga/change-requests/${id}/approve" \
        -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d '{}')
      case "$st" in
        2*) : ;;
        401|403)
          echo "FATAL: change-request approve ${id} returned HTTP ${st} ${label} - admin authentication/authorization failed." >&2
          echo "       Check KC_USER/KC_PASSWORD and admin privileges." >&2
          exit 1 ;;
        404|409|412) : ;;
        *) echo "  WARN approve ${id} -> ${st}" ;;
      esac
    done <<< "${ids}"
    ((rounds++)) || true
  done
  echo "  WARN drain hit round cap ${label}"; return 0
}

# ═════════════════════════════════════════════════════════════════════════════
#  Step 1: prepare realm JSON (placeholder substitution) + create the realm
# ═════════════════════════════════════════════════════════════════════════════
REALM_NAME="${NEW_REALM_NAME}"
echo "${REALM_NAME}" > "${MARKER_DIR}/.realm_name"

TMP_REALM_JSON="$(mktemp)"
cp "${REALM_JSON_PATH}" "${TMP_REALM_JSON}"

sed "${SED_INPLACE[@]}" "s|http://localhost:3000|${CLIENT_APP_URL}|g" "${TMP_REALM_JSON}"
sed "${SED_INPLACE[@]}" "s|nextjs-test|${REALM_NAME}|g"               "${TMP_REALM_JSON}"
sed "${SED_INPLACE[@]}" "s|myclient|${CLIENT_NAME}|g"                 "${TMP_REALM_JSON}"

# TideCloak console origin for THIS realm (used by the signed IdP settings).
TIDE_CONSOLE_ORIGIN="${TIDECLOAK_LOCAL_URL}/realms/${REALM_NAME}/tide-console/"

echo "Creating realm '${REALM_NAME}'..."
TOKEN="$(get_admin_token)"
api POST "${TIDECLOAK_LOCAL_URL}/admin/realms" \
  -H "Content-Type: application/json" \
  --data-binary @"${TMP_REALM_JSON}"
code="${RESP_CODE}"
if [[ "${code}" == 2* ]]; then
  echo "  realm create -> ${code} (created)"
elif [[ "${code}" == "409" ]]; then
  if [[ "${ALLOW_EXISTING_REALM:-}" == "1" ]]; then
    echo "  WARNING: realm '${REALM_NAME}' already exists (HTTP 409); ALLOW_EXISTING_REALM=1 set, proceeding." >&2
    echo "           NOTE: the drain step approves ALL pending change-requests in this realm," >&2
    echo "           including any unrelated to this provisioning run." >&2
  else
    echo "ERROR: Realm '${REALM_NAME}' already exists; this script provisions FRESH realms and would" >&2
    echo "       approve all pending change-requests. Set ALLOW_EXISTING_REALM=1 to override." >&2
    exit 1
  fi
else
  echo "ERROR: realm creation failed (HTTP ${code})" >&2
  echo "       ${RESP_BODY}" >&2
  exit 1
fi

# ═════════════════════════════════════════════════════════════════════════════
#  Step 2: setUpTideRealm (mints the realm VRK on the Tide Cybersecurity Fabric)
#          REQUIRES healthy ORKs. Non-2xx = fail loudly.
# ═════════════════════════════════════════════════════════════════════════════
echo "Setting up Tide realm (VRK keygen on the Tide Cybersecurity Fabric)..."
TOKEN="$(get_admin_token)"
api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/vendorResources/setUpTideRealm" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=${SUBSCRIPTION_EMAIL}" \
  --data-urlencode "isRagnarokEnabled=true" \
  --data-urlencode "skipLicense=false"
code="${RESP_CODE}"
if [[ "${code}" != 2* ]]; then
  echo "ERROR: setUpTideRealm failed (HTTP ${code})." >&2
  echo "       This step needs a healthy Cybersecurity Fabric (VRK keygen)." >&2
  echo "       Check that your ORKs are reachable and the license email is valid." >&2
  echo "       Response: ${RESP_BODY}" >&2
  exit 1
fi
echo "  setUpTideRealm -> ${code}"

# ═════════════════════════════════════════════════════════════════════════════
#  Step 3: stamp iga.attestor=tide on the realm BEFORE enabling IGA
# ═════════════════════════════════════════════════════════════════════════════
echo "Stamping iga.attestor=tide on the realm..."
TOKEN="$(get_admin_token)"
api GET "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}"
code="${RESP_CODE}"
if [[ "${code}" != 2* ]]; then
  echo "ERROR: could not fetch realm representation (HTTP ${code})." >&2
  echo "       Response: ${RESP_BODY}" >&2
  exit 1
fi
REALM_REP_FILE="$(mktemp)"
jq '.attributes = ((.attributes // {}) + {"iga.attestor":"tide"})' <<< "${RESP_BODY}" > "${REALM_REP_FILE}"
TOKEN="$(get_admin_token)"
api PUT "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}" \
  -H "Content-Type: application/json" \
  --data-binary @"${REALM_REP_FILE}"
code="${RESP_CODE}"
rm -f "${REALM_REP_FILE}"
if [[ "${code}" != 2* ]]; then
  echo "ERROR: failed to set iga.attestor=tide (HTTP ${code})." >&2
  echo "       Response: ${RESP_BODY}" >&2
  exit 1
fi
echo "  iga.attestor=tide -> ${code}"

# ═════════════════════════════════════════════════════════════════════════════
#  Step 4: enable IGA  (application/json body {"enabled":true})
# ═════════════════════════════════════════════════════════════════════════════
echo "Enabling IGA governance..."
TOKEN="$(get_admin_token)"
api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/tide-admin/toggle-iga" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true}'
code="${RESP_CODE}"
if [[ "${code}" == 2* ]]; then
  echo "  toggle-iga -> ${code} (IGA enabled)"
elif [[ "${code}" == "409" ]]; then
  echo "  toggle-iga -> 409 (already enabled)"
else
  echo "ERROR: toggle-iga failed (HTTP ${code})." >&2
  echo "       Response: ${RESP_BODY}" >&2
  exit 1
fi

# From here until the final grant+flip (step 14) the realm is half-provisioned:
# IGA is enabled but the first admin is not yet granted/flipped. A non-zero exit
# in this window triggers the incomplete-firstAdmin warning in cleanup().
INCOMPLETE_FIRSTADMIN=1

# ═════════════════════════════════════════════════════════════════════════════
#  Step 5: drain the ADOPT change-requests raised by enabling IGA
# ═════════════════════════════════════════════════════════════════════════════
drain_change_requests "(after IGA enable)"

# ═════════════════════════════════════════════════════════════════════════════
#  Step 6: create the admin user (tideInvitable + emailVerified:false at create)
# ═════════════════════════════════════════════════════════════════════════════
echo "Creating admin user..."
TOKEN="$(get_admin_token)"
api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@tidecloak.com","firstName":"Admin","lastName":"User","enabled":true,"emailVerified":false,"attributes":{"tideInvitable":["true"]}}'
code="${RESP_CODE}"
if [[ "${code}" == 2* || "${code}" == "201" ]]; then
  echo "  create user -> ${code}"
elif [[ "${code}" == "409" ]]; then
  echo "  create user -> 409 (already exists)"
elif [[ "${code}" == "202" ]]; then
  echo "  create user -> 202 (IGA change-request parked)"
else
  echo "ERROR: admin user creation failed (HTTP ${code})." >&2
  echo "       Response: ${RESP_BODY}" >&2
  exit 1
fi

# ═════════════════════════════════════════════════════════════════════════════
#  Step 7: drain (commits the CREATE_USER change-request) BEFORE resolving id
# ═════════════════════════════════════════════════════════════════════════════
drain_change_requests "(after user create)"

# ═════════════════════════════════════════════════════════════════════════════
#  Step 8: resolve the admin userId (non-empty proves the create committed)
# ═════════════════════════════════════════════════════════════════════════════
echo "Resolving admin userId..."
TOKEN="$(get_admin_token)"
api GET "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users?username=admin&exact=true"
code="${RESP_CODE}"
USER_ID="$(jq -r '.[0].id // empty' <<< "${RESP_BODY}")"
if [[ -z "${USER_ID}" ]]; then
  echo "ERROR: could not resolve admin userId (HTTP ${code}); the CREATE_USER change-request may not have committed." >&2
  echo "       Response: ${RESP_BODY}" >&2
  exit 1
fi
echo "  admin userId = ${USER_ID}"

# ═════════════════════════════════════════════════════════════════════════════
#  Step 9: mint the Tide enrollment link (link-tide-account-action)
# ═════════════════════════════════════════════════════════════════════════════
echo "Minting Tide enrollment link..."
TOKEN="$(get_admin_token)"
api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/tideAdminResources/get-required-action-link?userId=${USER_ID}&lifespan=3600" \
  -H "Content-Type: application/json" \
  -H "Accept: text/plain" \
  -d '["link-tide-account-action"]'
code="${RESP_CODE}"
if [[ "${code}" != 2* ]]; then
  echo "ERROR: failed to mint enrollment link (HTTP ${code})." >&2
  echo "       Response: ${RESP_BODY}" >&2
  exit 1
fi
INVITE_LINK="${RESP_BODY}"

# ═════════════════════════════════════════════════════════════════════════════
#  Step 10: HUMAN GATE - complete Tide enrollment in the enclave, then poll
#           until BOTH tideUserKey and vuid attributes appear on the user.
#           Re-fetch the admin token every iteration (master token ~60s).
# ═════════════════════════════════════════════════════════════════════════════
echo ""
echo "──────────────────────────────────────────────────────────────────────"
echo "  ACTION REQUIRED: Open this URL and complete Tide enrollment:"
echo ""
echo "    ${INVITE_LINK}"
echo ""
echo "  Enrollment happens in the Tide enclave and can take a few minutes."
echo "  This script will wait and continue automatically once you are enrolled."
echo "──────────────────────────────────────────────────────────────────────"
echo ""

poll_attempt=0
POLL_MAX=100000   # effectively unbounded (~4s * 100000)
while true; do
  poll_attempt=$(( poll_attempt + 1 ))
  TOKEN="$(get_admin_token)"
  ATTRS=$(curl -s "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users?username=admin&exact=true&briefRepresentation=false" \
    -H "Authorization: Bearer ${TOKEN}" -H "Cache-Control: no-store")
  KEY=$(jq -r '.[0].attributes.tideUserKey[0] // empty' <<< "${ATTRS}")
  VUID=$(jq -r '.[0].attributes.vuid[0]        // empty' <<< "${ATTRS}")
  if [[ -n "${KEY}" && -n "${VUID}" ]]; then
    echo "  Tide enrollment detected (tideUserKey + vuid present)."
    break
  fi
  if (( poll_attempt >= POLL_MAX )); then
    echo "ERROR: gave up waiting for Tide enrollment after ${poll_attempt} polls." >&2
    exit 1
  fi
  printf "  waiting for enrollment... (poll %s)\r" "${poll_attempt}"
  sleep 4
done

# ═════════════════════════════════════════════════════════════════════════════
#  Step 11: drain (commits the tideUserKey / vuid change-requests)
# ═════════════════════════════════════════════════════════════════════════════
drain_change_requests "(after enrollment)"

# ═════════════════════════════════════════════════════════════════════════════
#  Step 12: point the tide IdP at THIS realm's console origin, then sign it
# ═════════════════════════════════════════════════════════════════════════════
echo "Signing tide IdP settings (CustomAdminUIDomain -> console origin)..."
TOKEN="$(get_admin_token)"
api GET "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/identity-provider/instances/tide"
code="${RESP_CODE}"
if [[ "${code}" != 2* ]]; then
  echo "ERROR: could not fetch tide IdP instance (HTTP ${code})." >&2
  echo "       Response: ${RESP_BODY}" >&2
  exit 1
fi
IDP_REP_FILE="$(mktemp)"
jq --arg d "${TIDE_CONSOLE_ORIGIN}" '.config.CustomAdminUIDomain = $d' <<< "${RESP_BODY}" > "${IDP_REP_FILE}"
TOKEN="$(get_admin_token)"
api PUT "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/identity-provider/instances/tide" \
  -H "Content-Type: application/json" \
  --data-binary @"${IDP_REP_FILE}"
code="${RESP_CODE}"
rm -f "${IDP_REP_FILE}"
if [[ "${code}" != 2* ]]; then
  echo "ERROR: failed to update tide IdP settings (HTTP ${code})." >&2
  echo "       Response: ${RESP_BODY}" >&2
  exit 1
fi
TOKEN="$(get_admin_token)"
api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/vendorResources/sign-idp-settings" \
  -H "Content-Type: text/plain" \
  --data-binary ""
code="${RESP_CODE}"
if [[ "${code}" != 2* ]]; then
  echo "ERROR: sign-idp-settings failed (HTTP ${code}). Needs healthy ORKs." >&2
  echo "       Response: ${RESP_BODY}" >&2
  exit 1
fi
echo "  IdP settings signed -> ${code}"

# ═════════════════════════════════════════════════════════════════════════════
#  Step 13: grant tide-realm-admin to the enrolled admin (AFTER enrollment)
# ═════════════════════════════════════════════════════════════════════════════
echo "Granting tide-realm-admin to the admin user..."
TOKEN="$(get_admin_token)"
api GET "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/clients?clientId=${REALM_MGMT_CLIENT_ID}"
code="${RESP_CODE}"
RM_UUID="$(jq -r '.[0].id // empty' <<< "${RESP_BODY}")"
if [[ -z "${RM_UUID}" ]]; then
  echo "ERROR: could not resolve realm-management client uuid (HTTP ${code})." >&2
  exit 1
fi
TOKEN="$(get_admin_token)"
api GET "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/clients/${RM_UUID}/roles/${ADMIN_ROLE_NAME}"
code="${RESP_CODE}"
if [[ "${code}" != 2* ]]; then
  echo "ERROR: could not fetch ${ADMIN_ROLE_NAME} role (HTTP ${code})." >&2
  echo "       Response: ${RESP_BODY}" >&2
  exit 1
fi
ROLE_REP="${RESP_BODY}"

# idempotency: skip if the mapping already exists
TOKEN="$(get_admin_token)"
api GET "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users/${USER_ID}/role-mappings/clients/${RM_UUID}"
code="${RESP_CODE}"
ALREADY=$(jq -r --arg r "${ADMIN_ROLE_NAME}" '[.[]?.name] | index($r) // empty' <<< "${RESP_BODY}")
if [[ -n "${ALREADY}" ]]; then
  echo "  ${ADMIN_ROLE_NAME} already mapped; skipping grant."
else
  TOKEN="$(get_admin_token)"
  api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users/${USER_ID}/role-mappings/clients/${RM_UUID}" \
    -H "Content-Type: application/json" \
    -d "[${ROLE_REP}]"
  code="${RESP_CODE}"
  case "${code}" in
    2*)  echo "  grant -> ${code}" ;;
    202) echo "  grant -> 202 (change-request parked)" ;;
    409)
      echo "  grant -> 409; draining users then retrying once..."
      drain_change_requests "(grant 409 retry)"
      TOKEN="$(get_admin_token)"
      api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users/${USER_ID}/role-mappings/clients/${RM_UUID}" \
        -H "Content-Type: application/json" \
        -d "[${ROLE_REP}]"
      code="${RESP_CODE}"
      case "${code}" in
        2*|202|409) echo "  grant retry -> ${code}" ;;
        *) echo "ERROR: grant retry failed (HTTP ${code})." >&2; echo "       ${RESP_BODY}" >&2; exit 1 ;;
      esac
      ;;
    *)   echo "ERROR: grant failed (HTTP ${code})." >&2; echo "       ${RESP_BODY}" >&2; exit 1 ;;
  esac
fi

# ═════════════════════════════════════════════════════════════════════════════
#  Step 14: FINAL drain - commits GRANT_ROLES and flips firstAdmin->multiAdmin.
#           No drain or governed write may run after this point.
# ═════════════════════════════════════════════════════════════════════════════
drain_change_requests "(final: grant + firstAdmin->multiAdmin flip)"

# Grant+flip committed: the realm is fully provisioned. Clear the incomplete
# state flag so a later non-zero exit does NOT emit the half-provisioned warning.
INCOMPLETE_FIRSTADMIN=0

# ═════════════════════════════════════════════════════════════════════════════
#  Step 15: fetch the client adapter config (tidecloak.json)
# ═════════════════════════════════════════════════════════════════════════════
echo "Fetching adapter config..."
TOKEN="$(get_admin_token)"
api GET "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/clients?clientId=${CLIENT_NAME}"
code="${RESP_CODE}"
CLIENT_UUID="$(jq -r '.[0].id // empty' <<< "${RESP_BODY}")"
if [[ -z "${CLIENT_UUID}" ]]; then
  echo "ERROR: could not resolve client '${CLIENT_NAME}' uuid (HTTP ${code})." >&2
  exit 1
fi
TOKEN="$(get_admin_token)"
adapter_code=$(curl -s -o "${ADAPTER_OUTPUT_PATH}" -w "%{http_code}" \
  "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/vendorResources/get-installations-provider?clientId=${CLIENT_UUID}&providerId=keycloak-oidc-keycloak-json" \
  -H "Authorization: Bearer ${TOKEN}")
if [[ "${adapter_code}" != 2* ]]; then
  echo "ERROR: failed to fetch adapter config (HTTP ${adapter_code})." >&2
  exit 1
fi
echo "  Adapter config saved to ${ADAPTER_OUTPUT_PATH}"

echo ""
echo "All done. Realm '${REALM_NAME}' is provisioned and the first admin is enrolled."
