#!/usr/bin/env node
const { copyFileSync, existsSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');

// utility to find nearest package.json
function findProjectRoot(startDir) {
  let dir = startDir;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  return null;
}

// find package root (the one that contains this script)
const scriptDir = __dirname;
const pkgRoot   = join(scriptDir, '..');

// find the host app’s root by looking for its package.json
const projectRoot = findProjectRoot(process.cwd()) || process.cwd();

// set up source + destination
const source  = join(pkgRoot, 'dist', 'silent-check-sso.html');
const destDir = join(projectRoot, 'public');
const dest    = join(destDir, 'silent-check-sso.html');

// ensure public/ exists
if (!existsSync(destDir)) {
  try {
    mkdirSync(destDir, { recursive: true });
    console.log(`[tidecloak-js] created directory ${destDir}`);
  } catch (err) {
    console.error(`[tidecloak-js] failed to create ${destDir}:`, err);
    process.exit(1);
  }
}

// copy the HTML file
try {
  copyFileSync(source, dest);
  console.log(`[tidecloak-js] copied silent-check-sso.html → ${destDir}/`);
} catch (err) {
  console.error(`[tidecloak-js] failed to copy file:`, err);
  process.exit(1);
}
