// Policy Builder - Demo App Server
// Starts the demo application that showcases the @tidecloak/policy library

import { createServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startDemoApp() {
  console.log('[demo] Starting Policy Builder demo app on port 5000...');
  
  try {
    const demoRoot = path.resolve(__dirname, '../packages/demo');
    
    const server = await createServer({
      configFile: path.resolve(demoRoot, 'vite.config.ts'),
      root: demoRoot,
    });

    await server.listen();
    
    console.log('\n🎨 Policy Builder Demo App');
    console.log('   Importing @tidecloak/policy from source (hot reload enabled)');
    server.printUrls();
  } catch (error) {
    console.error('[demo] Failed to start demo app:', error);
    process.exit(1);
  }
}

startDemoApp();
