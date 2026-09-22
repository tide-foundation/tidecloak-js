// Drives the plugin's middleware over real HTTP, since the failures that matter
// here are plumbing: what reaches the wire, and falling through to the next handler.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { tideDpopPlugin } from '../src/vite.js';
import { dpopAuthPathFor, DPOP_AUTH_HTML, DPOP_AUTH_CSP } from '../src/dpopServer.js';

const config = { 'auth-server-url': 'http://localhost:8080', realm: 'myrealm', resource: 'myclient' };
const PATH = dpopAuthPathFor('http://localhost:8080/realms/myrealm', 'myclient');

async function serve(plugin, hook = 'configureServer') {
  const stack = [];
  plugin[hook]({ middlewares: { use: (fn) => stack.push(fn) } });
  const server = http.createServer((req, res) => {
    let i = 0;
    const next = () => (i < stack.length ? stack[i++](req, res, next) : res.writeHead(404).end('fell through'));
    next();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { get: (path, init) => fetch(base + path, init), close: () => new Promise((r) => server.close(r)) };
}

test('serves the page with both headers in dev and preview', async () => {
  for (const hook of ['configureServer', 'configurePreviewServer']) {
    const s = await serve(tideDpopPlugin({ config }), hook);
    try {
      const res = await s.get(`${PATH}?version=1&openerOrigin=x`);
      assert.equal(res.status, 200, hook);
      assert.equal(res.headers.get('content-security-policy'), DPOP_AUTH_CSP);
      assert.equal(res.headers.get('allow-csp-from'), '*');
      assert.equal(await res.text(), DPOP_AUTH_HTML);
    } finally {
      await s.close();
    }
  }
});

test('HEAD returns headers with no body', async () => {
  const s = await serve(tideDpopPlugin({ config }));
  try {
    const res = await s.get(PATH, { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('allow-csp-from'), '*');
  } finally {
    await s.close();
  }
});

test('refuses another client, and passes other paths on', async () => {
  const s = await serve(tideDpopPlugin({ config }));
  try {
    assert.equal((await s.get(dpopAuthPathFor('http://localhost:8080/realms/myrealm', 'other'))).status, 403);
    const other = await s.get('/some/route');
    assert.equal(other.status, 404);
    assert.equal(await other.text(), 'fell through');
  } finally {
    await s.close();
  }
});

test('without a config it still serves, and warns that it cannot check', async () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(msg);
  try {
    const s = await serve(tideDpopPlugin());
    try {
      assert.equal((await s.get(PATH)).status, 200);
    } finally {
      await s.close();
    }
  } finally {
    console.warn = warn;
  }
  assert.equal(warnings.length, 1);
});
