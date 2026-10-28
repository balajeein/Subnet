import { createServer } from 'vite';
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import electron from 'electron';
import { watch } from 'node:fs';
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

// 3. Launch Electron app pointing to dev server.
// Vite handles renderer HMR; the watcher below rebuilds and restarts Electron
// when the main process or preload changes.
let electronProcess;
let restartTimer;
let isRestarting = false;
let isShuttingDown = false;

const electronEnv = {
  ...process.env,
  NODE_ENV: 'development',
  VITE_DEV_SERVER_URL: devServerUrl,
  // Keep each terminal's dev instance separate so local testing can discover
  // multiple Subnet processes instead of sharing one peer identity/history.
  SUBNET_INSTANCE_ID: process.env.SUBNET_INSTANCE_ID || `${process.pid}-${crypto.randomUUID().slice(0, 8)}`,
};

function launchElectron() {
  console.log('🚀 Launching Subnet Desktop...');
  electronProcess = spawn(electron, ['.'], {
    stdio: 'inherit',
    env: electronEnv,
  });

  electronProcess.on('close', (code) => {
    if (isRestarting || isShuttingDown) return;
    console.log(`Subnet exited with code ${code}`);
    void shutdown(code || 0);
  });
}

async function restartElectron() {
  if (isRestarting || isShuttingDown) return;
  isRestarting = true;
  console.log('🔄 Electron source changed; rebuilding and restarting...');

  const processToStop = electronProcess;
  if (processToStop && !processToStop.killed) {
    await new Promise((resolve) => {
      processToStop.once('close', resolve);
      processToStop.kill();
    });
  }

  try {
    execSync('npm run build:electron', { stdio: 'inherit' });
    launchElectron();
  } catch (error) {
    console.error('Electron rebuild failed. Fix the error and save again to retry.');
    console.error(error);
  } finally {
    isRestarting = false;
  }
}

function scheduleElectronRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => void restartElectron(), 250);
}

const watchers = [
  watch(path.resolve('electron'), { recursive: true }, (_event, filename) => {
    if (filename && filename.endsWith('.ts')) scheduleElectronRestart();
  }),
  watch(path.resolve('tsconfig.electron.json'), () => scheduleElectronRestart()),
];

console.log('✨ Renderer HMR is enabled. Electron main/preload changes restart automatically.');
launchElectron();

async function shutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  clearTimeout(restartTimer);
  watchers.forEach((watcher) => watcher.close());
  if (electronProcess && !electronProcess.killed) electronProcess.kill();
  await server.close();
  process.exit(exitCode);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
