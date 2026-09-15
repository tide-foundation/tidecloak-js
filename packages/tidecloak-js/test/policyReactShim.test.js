import test from 'node:test';
import assert from 'node:assert/strict';

import * as policyReact from '../src/policy-react.js';

test('the deprecated policy-react entry keeps its export names', () => {
  assert.deepEqual(
    Object.keys(policyReact).sort(),
    ['BlockPalette', 'PolicyBuilder', 'PolicyCanvas', 'PropertiesPanel'],
  );
});

test('each deprecated policy component throws a clear error when rendered', () => {
  for (const [name, Component] of Object.entries(policyReact)) {
    assert.throws(() => Component({}), new RegExp(`${name} .*moved out of @tidecloak/js`));
  }
});
