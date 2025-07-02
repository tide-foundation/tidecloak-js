#!/usr/bin/env node
const { copyFileSync, existsSync } = require('fs');
const { join } = require('path');

// the directory of this script
const scriptDir = __dirname;
// package root is one level up
const pkgRoot   = join(scriptDir, '..');

// where the user ran npm install
const initCwd = process.env.INIT_CWD;
if (!initCwd) {
  console.warn('[@tidecloak/react] no INIT_CWD, skipping copy');
  process.exit(0);
}

// our bundled HTML
const source = join(pkgRoot, 'dist', 'silent-check-sso.html');
// target public/ in the consuming app
const destDir = join(initCwd, 'public');
const dest    = join(destDir, 'silent-check-sso.html');

if (!existsSync(destDir)) {
  console.warn(`[@tidecloak/react] no public/ in ${initCwd}, skipping copy`);
  process.exit(0);
}

try {
  copyFileSync(source, dest);
  console.log(`[@tidecloak/react] copied silent-check-sso.html → ${destDir}/`);
} catch (err) {
  console.error(`[@tidecloak/react] copy failed:`, err);
}
