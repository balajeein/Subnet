import { createServer } from 'vite';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import path from 'node:path';

// 1. Compile Electron main and preload via TypeScript
console.log('⚡ Compiling Electron main and preload...');
execSync('npm run build:electron', { stdio: 'inherit' });

// 2. Start Vite development server
const server = await createServer({
  configFile: path.resolve('vite.config.ts'),
});
await server.listen();

const address = server.httpServer?.address();
const devServerUrl = typeof address === 'object' && address ? `http://localhost:${address.port}` : 'http://localhost:5173';
console.log(`🛰️  Vite dev server listening at: ${devServerUrl}`);

// 3. Launch Electron app pointing to dev server
console.log('🚀 Launching Subnet Desktop...');
const electronProcess = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    VITE_DEV_SERVER_URL: devServerUrl,
  },
});

electronProcess.on('close', (code) => {
  console.log(`Subnet exited with code ${code}`);
  server.close();
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  electronProcess.kill();
  server.close();
  process.exit(0);
});
