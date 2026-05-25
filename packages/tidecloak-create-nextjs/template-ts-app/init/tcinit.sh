#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Resolve script directory (run from anywhere)
# ─────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"

# ─────────────────────────────────────────────────────────────────────────────
# Load overrides from .env.example (CRLF-safe)
# ─────────────────────────────────────────────────────────────────────────────
ENV_FILE="${SCRIPT_DIR}/.env.example"
if [[ -f "$ENV_FILE" ]]; then
  if grep -q $'\r' "$ENV_FILE"; then
    TMP_ENV="$(mktemp)"
    tr -d '\r' < "$ENV_FILE" > "$TMP_ENV"
    # shellcheck disable=SC1090
    source "$TMP_ENV"
    rm -f "$TMP_ENV"
  else
    # shellcheck disable=SC1090
    source "$ENV_FILE"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Defaults (override via env)
# ─────────────────────────────────────────────────────────────────────────────
TIDECLOAK_LOCAL_URL="${TIDECLOAK_LOCAL_URL:-http://localhost:8080}"
CLIENT_APP_URL="${CLIENT_APP_URL:-http://localhost:3000}"
ADAPTER_OUTPUT_PATH="${ADAPTER_OUTPUT_PATH:-${SCRIPT_DIR}/tidecloak.json}"
NEW_REALM_NAME="${NEW_REALM_NAME:-nextjs-test}"
REALM_MGMT_CLIENT_ID="${REALM_MGMT_CLIENT_ID:-realm-management}"
ADMIN_ROLE_NAME="${ADMIN_ROLE_NAME:-tide-realm-admin}"
KC_USER="${KC_USER:-admin}"
KC_PASSWORD="${KC_PASSWORD:-password}"
CLIENT_NAME="${CLIENT_NAME:-myclient}"

# ─────────────────────────────────────────────────────────────────────────────
# Find realm.json robustly
# Priority: env → same dir → parent → current working dir
# ─────────────────────────────────────────────────────────────────────────────
CANDIDATES=()
[[ "${REALM_JSON_PATH:-}" != "" ]] && CANDIDATES+=("${REALM_JSON_PATH}")
CANDIDATES+=("${SCRIPT_DIR}/realm.json" "${SCRIPT_DIR}/../realm.json" "$(pwd)/realm.json")

REALM_JSON_PATH=""
for p in "${CANDIDATES[@]}"; do
  if [[ -f "$p" ]]; then REALM_JSON_PATH="$p"; break; fi
done

echo "🔍 realm.json search candidates:"
for p in "${CANDIDATES[@]}"; do echo "   - $p"; done

if [[ -z "${REALM_JSON_PATH}" ]]; then
  echo "❌ Could not find realm.json in the checked locations above." >&2
  echo "   Put realm.json next to the script: ${SCRIPT_DIR}/realm.json" >&2
  echo "   OR run with: REALM_JSON_PATH=/absolute/path/realm.json bash init/tcinit.sh" >&2
  exit 1
fi
echo "✅ Using realm.json: ${REALM_JSON_PATH}"

# ─────────────────────────────────────────────────────────────────────────────
# Dependency checks
# ─────────────────────────────────────────────────────────────────────────────
need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing dependency: $1" >&2; exit 1; }; }
need_cmd curl
need_cmd jq
need_cmd sed
need_cmd mktemp

# sed -i portability
if sed --version >/dev/null 2>&1; then SED_INPLACE=(-i); else SED_INPLACE=(-i ''); fi

# ─────────────────────────────────────────────────────────────────────────────
# Helper: grab an admin token
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
# Cleanup handler
# ─────────────────────────────────────────────────────────────────────────────
TMP_REALM_JSON=""
cleanup() {
  [[ -n "${TMP_REALM_JSON}" && -f "${TMP_REALM_JSON}" ]] && rm -f "${TMP_REALM_JSON}" || true
  [[ -f "${SCRIPT_DIR}/.realm_name" ]] && rm -f "${SCRIPT_DIR}/.realm_name" || true
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: prepare realm JSON
# ─────────────────────────────────────────────────────────────────────────────
REALM_NAME="${NEW_REALM_NAME}"
echo "${REALM_NAME}" > "${SCRIPT_DIR}/.realm_name"

TMP_REALM_JSON="$(mktemp)"
cp "${REALM_JSON_PATH}" "${TMP_REALM_JSON}"

sed "${SED_INPLACE[@]}" "s|http://localhost:3000|${CLIENT_APP_URL}|g" "${TMP_REALM_JSON}"
sed "${SED_INPLACE[@]}" "s|nextjs-test|${REALM_NAME}|g"               "${TMP_REALM_JSON}"
sed "${SED_INPLACE[@]}" "s|myclient|${CLIENT_NAME}|g"                 "${TMP_REALM_JSON}"

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: create realm (allow 409 if already exists)
# ─────────────────────────────────────────────────────────────────────────────
TOKEN="$(get_admin_token)"
echo "🌍 Creating realm..."
status=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${TIDECLOAK_LOCAL_URL}/admin/realms" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @"${TMP_REALM_JSON}")

if [[ ${status} == 2* || ${status} -eq 409 ]]; then
  echo "✅ Realm created (or already exists)."
else
  echo "❌ Realm creation failed (HTTP ${status})" >&2
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: initialize Tide realm + IGA
# ─────────────────────────────────────────────────────────────────────────────
TOKEN="$(get_admin_token)"
echo "🔐 Initializing Tide realm + IGA..."

curl -s -X POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/vendorResources/setUpTideRealm" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=${SUBSCRIPTION_EMAIL:-test@demo.org}" >/dev/null

curl -s -X POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/tide-admin/toggle-iga" \
     -H "Authorization: Bearer ${TOKEN}" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data-urlencode "isIGAEnabled=true" >/dev/null

echo "✅ Tide realm + IGA done."

# ─────────────────────────────────────────────────────────────────────────────
# Approve & commit change-sets
# ─────────────────────────────────────────────────────────────────────────────
approve_and_commit() {
  local TYPE=$1
  echo "🔄 Processing ${TYPE} change-sets..."
  TOKEN="$(get_admin_token)"
  curl -s -X GET "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/tide-admin/change-set/${TYPE}/requests" \
       -H "Authorization: Bearer ${TOKEN}" \
    | jq -c '.[]' | while IFS= read -r req; do
        payload=$(jq -n \
          --arg id  "$(jq -r .draftRecordId   <<< "${req}")" \
          --arg cst "$(jq -r .changeSetType   <<< "${req}")" \
          --arg at  "$(jq -r .actionType      <<< "${req}")" \
          '{changeSetId:$id,changeSetType:$cst,actionType:$at}')

        curl -s -X POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/tide-admin/change-set/sign" \
             -H "Authorization: Bearer ${TOKEN}" \
             -H "Content-Type: application/json" \
             -d "${payload}" >/dev/null

        curl -s -X POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/tide-admin/change-set/commit" \
             -H "Authorization: Bearer ${TOKEN}" \
             -H "Content-Type: application/json" \
             -d "${payload}" >/dev/null
      done
  echo "✅ ${TYPE^} change-sets done."
}
approve_and_commit clients

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: create admin user + assign role
# ─────────────────────────────────────────────────────────────────────────────
TOKEN="$(get_admin_token)"
echo "👤 Creating new admin user..."
curl -s -X POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users" \
     -H "Authorization: Bearer ${TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","email":"admin@tidecloak.com","firstName":"admin","lastName":"user","enabled":true}' >/dev/null || true

USER_ID=$(curl -s -X GET \
  "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users?username=admin" \
  -H "Authorization: Bearer ${TOKEN}" | jq -r '.[0].id')

CLIENT_UUID=$(curl -s -X GET \
  "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/clients?clientId=${REALM_MGMT_CLIENT_ID}" \
  -H "Authorization: Bearer ${TOKEN}" | jq -r '.[0].id')

ROLE_JSON=$(curl -s -X GET \
  "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/roles/${ADMIN_ROLE_NAME}" \
  -H "Authorization: Bearer ${TOKEN}")

curl -s -X POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users/${USER_ID}/role-mappings/clients/${CLIENT_UUID}" \
     -H "Authorization: Bearer ${TOKEN}" \
     -H "Content-Type: application/json" \
     -d "[${ROLE_JSON}]" >/dev/null

echo "✅ Admin user & role done."

# ─────────────────────────────────────────────────────────────────────────────
# Step 5: generate invite link + wait
# ─────────────────────────────────────────────────────────────────────────────
TOKEN="$(get_admin_token)"
echo "🔗 Generating invite link..."
INVITE_LINK=$(curl -s -X POST \
  "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/tideAdminResources/get-required-action-link?userId=${USER_ID}&lifespan=43200" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '["link-tide-account-action"]')

echo "🔗 Invite link: ${INVITE_LINK}"
echo "→ Send this link to the user so they can link their account."

MAX_TRIES=3
attempt=1
while true; do
  echo -n "Checking link status (attempt ${attempt}/${MAX_TRIES})… "
  ATTRS=$(curl -s -X GET \
    "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users?username=admin" \
    -H "Authorization: Bearer ${TOKEN}")

  KEY=$(jq -r '.[0].attributes.tideUserKey[0] // empty' <<< "${ATTRS}")
  VUID=$(jq -r '.[0].attributes.vuid[0]        // empty' <<< "${ATTRS}")

  if [[ -n "${KEY}" && -n "${VUID}" ]]; then
    echo "✅ Linked!"
    break
  fi

  if (( attempt >= MAX_TRIES )); then
    echo "⚠️  Max retries reached (${MAX_TRIES}). Moving on."
    break
  fi

  read -t 30 -p "Not linked yet; press ENTER to retry or wait 30s…" || true
  echo
  ((attempt++))
done

approve_and_commit users

# ─────────────────────────────────────────────────────────────────────────────
# Step 6: update CustomAdminUIDomain
# ─────────────────────────────────────────────────────────────────────────────
TOKEN="$(get_admin_token)"
echo "🌐 Updating CustomAdminUIDomain..."

INST_JSON=$(curl -s -X GET \
  "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/identity-provider/instances/tide" \
  -H "Authorization: Bearer ${TOKEN}")

UPDATED_JSON=$(jq --arg d "${CLIENT_APP_URL}" '.config.CustomAdminUIDomain = $d' <<< "${INST_JSON}")

curl -s -X PUT "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/identity-provider/instances/tide" \
     -H "Authorization: Bearer ${TOKEN}" \
     -H "Content-Type: application/json" \
     -d "${UPDATED_JSON}" >/dev/null

curl -s -X POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/vendorResources/sign-idp-settings" \
     -H "Authorization: Bearer ${TOKEN}" >/dev/null

echo "✅ CustomAdminUIDomain updated + signed."

# ─────────────────────────────────────────────────────────────────────────────
# Step 7: fetch adapter config
# ─────────────────────────────────────────────────────────────────────────────
TOKEN="$(get_admin_token)"
echo "📥 Fetching adapter config…"
CLIENT_UUID=$(curl -s -X GET \
  "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/clients?clientId=${CLIENT_NAME}" \
  -H "Authorization: Bearer ${TOKEN}" | jq -r '.[0].id')

curl -s -X GET \
  "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/vendorResources/get-installations-provider?clientId=${CLIENT_UUID}&providerId=keycloak-oidc-keycloak-json" \
  -H "Authorization: Bearer ${TOKEN}" > "${ADAPTER_OUTPUT_PATH}"

echo "✅ Adapter config saved to ${ADAPTER_OUTPUT_PATH}"
echo "🎉 All done!"
