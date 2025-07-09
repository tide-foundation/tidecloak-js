#!/usr/bin/env node
const { copyFileSync, existsSync, mkdirSync } = require('fs');
const { join, dirname, sep } = require('path');

// find the nearest package.json upwards, but skip anything inside node_modules
function findProjectRoot(startDir) {
  let dir = startDir;
  while (dir !== dirname(dir)) {
    // if we're inside node_modules, ignore this level
    if (!dir.split(sep).includes('node_modules') &&
      existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return null;
}

// where npm/yarn was invoked (if available)
const initialCwd = process.env.INIT_CWD || process.cwd();

// find the first non-node_modules package.json above that
const projectRoot = findProjectRoot(initialCwd) || process.cwd();

// now build paths
const pkgRoot = join(__dirname, '..');
const source = join(pkgRoot, 'dist', 'silent-check-sso.html');
const destDir = join(projectRoot, 'public');
const destFile = join(destDir, 'silent-check-sso.html');

// debug logging—remove in production
console.log(`[tidecloak-js] initialCwd: ${initialCwd}`);
console.log(`[tidecloak-js] projectRoot: ${projectRoot}`);

// ensure public/ exists
if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
  console.log(`[tidecloak-js] created directory ${destDir}`);
}

// copy the HTML file
copyFileSync(source, destFile);
console.log(`[tidecloak-js] copied silent-check-sso.html → ${destDir}/`);
