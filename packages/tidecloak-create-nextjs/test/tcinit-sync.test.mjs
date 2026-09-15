// init/tcinit.sh (run by create.ts) and the copies shipped in each template
// share one governance body. Only the path preamble is allowed to differ.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')

const canonical = read('init/tcinit.sh')
const tsCopy = read('template-ts-app/init/tcinit.sh')
const jsCopy = read('template-js-app/init/tcinit.sh')

const BODY_MARKER = '#  Helper: grab a fresh master admin-cli token'

function body(script, name) {
  const at = script.indexOf(BODY_MARKER)
  assert.notEqual(at, -1, `${name} is missing the "${BODY_MARKER}" marker`)
  return script.slice(at)
}

function defaults(script) {
  const start = script.indexOf('TIDECLOAK_LOCAL_URL="${TIDECLOAK_LOCAL_URL:-')
  const end = script.indexOf('ADAPTER_OUTPUT_PATH=', start)
  assert.ok(start !== -1 && end !== -1, 'defaults block not found')
  return script.slice(start, end)
}

test('the two template copies are identical', () => {
  assert.equal(tsCopy, jsCopy)
})

test('the governance body matches the canonical script', () => {
  assert.equal(body(tsCopy, 'template copy'), body(canonical, 'init/tcinit.sh'))
})

test('the env defaults match the canonical script', () => {
  assert.equal(defaults(tsCopy), defaults(canonical))
})

test('every copy writes tidecloak.json to the app root unless ADAPTER_OUTPUT_PATH is set', () => {
  // Canonical: PROJECT_ROOT is the package root, where create.ts picks the file up.
  assert.match(canonical, /^ADAPTER_OUTPUT_PATH="\$\{ADAPTER_OUTPUT_PATH:-\$\{PROJECT_ROOT\}\/tidecloak\.json\}"$/m)
  // Template copies live in <app>/init, so the app root is one level up.
  assert.match(tsCopy, /^ADAPTER_OUTPUT_PATH="\$\{ADAPTER_OUTPUT_PATH:-\$\{SCRIPT_DIR\}\/\.\.\/tidecloak\.json\}"$/m)
})
