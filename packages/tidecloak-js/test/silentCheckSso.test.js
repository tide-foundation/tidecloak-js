/**
 * Tests for the silent-check-SSO redirect URI resolver.
 *
 * Run with: npm test  (uses node:test - no external dependencies)
 *
 * The regression these lock down: a sub-path-hosted app (e.g. a console served
 * at `https://host/realms/<realm>/tide-console/`) used to get the hardcoded
 * origin-root URI `https://host/silent-check-sso.html`, which is neither served
 * nor a registered redirectUri -> `400 Invalid parameter: redirect_uri` -> the
 * silent iframe never posts back -> the app hangs on its bootstrap spinner.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSilentCheckSsoRedirectUri,
  SILENT_CHECK_SSO_FILENAME
} from '../src/utils/silentCheckSso.js';

const ORIGIN = 'https://staging.dauth.me';
const CONSOLE_BASE = '/realms/myrealm/tide-console/';

test('an explicit caller-supplied URI always wins', () => {
  const explicit = `${ORIGIN}${CONSOLE_BASE}${SILENT_CHECK_SSO_FILENAME}`;
  const result = resolveSilentCheckSsoRedirectUri({
    origin: ORIGIN,
    configured: explicit,
    // Even with competing signals present, the explicit value must be used verbatim.
    baseHref: `${ORIGIN}/somewhere-else/`,
    redirectUri: `${ORIGIN}/other/auth/redirect`
  });

  assert.equal(result.uri, explicit);
  assert.equal(result.source, 'config');
});

test('an explicit URI survives even when it is the only thing supplied', () => {
  const explicit = `${ORIGIN}${CONSOLE_BASE}${SILENT_CHECK_SSO_FILENAME}`;
  const result = resolveSilentCheckSsoRedirectUri({ origin: ORIGIN, configured: explicit });

  assert.equal(result.uri, explicit);
  assert.equal(result.source, 'config');
});

test('derives a base-aware URI from a declared <base href>', () => {
  const result = resolveSilentCheckSsoRedirectUri({
    origin: ORIGIN,
    baseHref: `${ORIGIN}${CONSOLE_BASE}`
  });

  assert.equal(result.uri, `${ORIGIN}${CONSOLE_BASE}${SILENT_CHECK_SSO_FILENAME}`);
  assert.equal(result.source, 'base-href');
});

test('derives the app base from the SDK `<base>auth/redirect` convention', () => {
  // This is the exact shape a sub-path-hosted console configures.
  const result = resolveSilentCheckSsoRedirectUri({
    origin: ORIGIN,
    redirectUri: `${ORIGIN}${CONSOLE_BASE}auth/redirect`
  });

  // Must be `<base>/silent-check-sso.html`, NOT `<base>/auth/silent-check-sso.html`
  // (one directory too deep) and NOT the origin root.
  assert.equal(result.uri, `${ORIGIN}${CONSOLE_BASE}${SILENT_CHECK_SSO_FILENAME}`);
  assert.equal(result.source, 'redirect-uri-convention');
});

test('the sub-path case never falls back to origin-root (the outage)', () => {
  const result = resolveSilentCheckSsoRedirectUri({
    origin: ORIGIN,
    redirectUri: `${ORIGIN}${CONSOLE_BASE}auth/redirect`
  });

  assert.notEqual(result.uri, `${ORIGIN}/${SILENT_CHECK_SSO_FILENAME}`);
});

test('derives from a non-conventional redirect path via its own directory', () => {
  const result = resolveSilentCheckSsoRedirectUri({
    origin: ORIGIN,
    redirectUri: `${ORIGIN}/app/callback`
  });

  assert.equal(result.uri, `${ORIGIN}/app/${SILENT_CHECK_SSO_FILENAME}`);
  assert.equal(result.source, 'redirect-uri');
});

test('BACK-COMPAT: a root-hosted app with the default redirectUri still gets origin-root', () => {
  const result = resolveSilentCheckSsoRedirectUri({
    origin: ORIGIN,
    redirectUri: `${ORIGIN}/auth/redirect` // the SDK's own origin-root default
  });

  assert.equal(result.uri, `${ORIGIN}/${SILENT_CHECK_SSO_FILENAME}`);
  assert.equal(result.source, 'redirect-uri-convention');
});

test('BACK-COMPAT: an app declaring nothing at all still gets origin-root', () => {
  // Every existing root-hosted consumer that configures neither a base nor a
  // redirectUri must keep working exactly as before.
  const result = resolveSilentCheckSsoRedirectUri({ origin: ORIGIN });

  assert.equal(result.uri, `${ORIGIN}/${SILENT_CHECK_SSO_FILENAME}`);
  assert.equal(result.source, 'origin-root');
});

test('a root-level callback resolves to origin-root', () => {
  const result = resolveSilentCheckSsoRedirectUri({
    origin: ORIGIN,
    redirectUri: `${ORIGIN}/callback`
  });

  assert.equal(result.uri, `${ORIGIN}/${SILENT_CHECK_SSO_FILENAME}`);
});

test('<base href> takes precedence over redirectUri', () => {
  const result = resolveSilentCheckSsoRedirectUri({
    origin: ORIGIN,
    baseHref: `${ORIGIN}${CONSOLE_BASE}`,
    redirectUri: `${ORIGIN}/elsewhere/auth/redirect`
  });

  assert.equal(result.uri, `${ORIGIN}${CONSOLE_BASE}${SILENT_CHECK_SSO_FILENAME}`);
  assert.equal(result.source, 'base-href');
});

test('a relative <base href> resolves against the origin', () => {
  const result = resolveSilentCheckSsoRedirectUri({
    origin: ORIGIN,
    baseHref: CONSOLE_BASE
  });

  assert.equal(result.uri, `${ORIGIN}${CONSOLE_BASE}${SILENT_CHECK_SSO_FILENAME}`);
  assert.equal(result.source, 'base-href');
});

test('FAILS LOUD on a cross-origin redirectUri rather than guessing', () => {
  const result = resolveSilentCheckSsoRedirectUri({
    origin: ORIGIN,
    redirectUri: 'https://evil.example.com/app/auth/redirect'
  });

  assert.equal(result.uri, undefined);
  assert.equal(result.source, 'none');
  assert.match(result.reason, /different origin/);
});

test('FAILS LOUD when there is no origin (non-browser context)', () => {
  const result = resolveSilentCheckSsoRedirectUri({});

  assert.equal(result.uri, undefined);
  assert.equal(result.source, 'none');
});

test('an empty-string config value is not treated as supplied', () => {
  const result = resolveSilentCheckSsoRedirectUri({ origin: ORIGIN, configured: '   ' });

  // Falls through to origin-root rather than emitting an empty redirect_uri.
  assert.equal(result.uri, `${ORIGIN}/${SILENT_CHECK_SSO_FILENAME}`);
  assert.equal(result.source, 'origin-root');
});
