// CommonJS version
const { mkdir, cp } = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const srcCss = path.join(root, 'src', 'policy.css');

  // ESM build target (what your package.json exports)
  const esmDir = path.join(root, 'dist', 'esm', 'src');
  await mkdir(esmDir, { recursive: true });
  await cp(srcCss, path.join(esmDir, 'policy.css'));

  // (Optional) also copy to CJS side for symmetry
  const cjsDir = path.join(root, 'dist', 'cjs', 'src');
  await mkdir(cjsDir, { recursive: true });
  await cp(srcCss, path.join(cjsDir, 'policy.css'));

  console.log('[tidecloak-js] Copied policy.css to dist/esm/src and dist/cjs/src');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
