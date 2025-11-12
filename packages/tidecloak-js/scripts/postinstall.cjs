// scripts/postinstall.cjs (CommonJS)
const { copyFileSync, existsSync, mkdirSync } = require('node:fs');
const path = require('node:path');

// npm sets INIT_CWD to the *consumer* project root that ran `npm i`
const initCwd = process.env.INIT_CWD || process.cwd();
const pkgRoot = __dirname ? path.resolve(__dirname, '..') : process.cwd();

// where the file should end up in the *consumer* app
const targetDir = path.join(initCwd, 'public');
const targetFile = path.join(targetDir, 'silent-check-sso.html');

// possible sources inside this package
const distSrc = path.join(pkgRoot, 'dist', 'silent-check-sso.html');
const srcSrc  = path.join(pkgRoot, 'silent-check-sso.html');

// no-op if the consumer doesn't have a public/ folder
if (!existsSync(targetDir)) {
  console.log('[tidecloak-js] No public/ directory in consumer, skipping copy.');
  process.exit(0);
}

// find a source file to copy
let source = null;
if (existsSync(distSrc)) source = distSrc;
else if (existsSync(srcSrc)) source = srcSrc;

if (!source) {
  console.log('[tidecloak-js] silent-check-sso.html not found in package, skipping copy.');
  process.exit(0);
}

// ensure target dir exists and copy
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, targetFile);
console.log(`[tidecloak-js] Copied ${path.basename(source)} → ${targetFile}`);
