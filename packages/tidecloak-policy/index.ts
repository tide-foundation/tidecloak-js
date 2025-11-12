// Frontend-only Policy Builder component library
// This file just starts the Vite dev server for local development

import { spawn } from 'child_process';

const vite = spawn('npx', ['vite', '--port', '5000', '--host', '0.0.0.0'], {
  stdio: 'inherit',
});

vite.on('error', (error) => {
  console.error('Failed to start Vite:', error);
  process.exit(1);
});

vite.on('exit', (code) => {
  process.exit(code || 0);
});
