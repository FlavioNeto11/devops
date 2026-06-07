import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const { spawn } = await import('node:child_process');
const fs = await import('node:fs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const envFilePath = path.join(workspaceRoot, 'storage', 'temp', 'stitch.env');

function loadStitchApiKey() {
  if (!fs.existsSync(envFilePath)) {
    throw new Error(`Arquivo de segredo não encontrado: ${envFilePath}`);
  }

  const parsed = dotenv.parse(fs.readFileSync(envFilePath, 'utf8'));
  const apiKey = parsed.STITCH_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(`A variável STITCH_API_KEY não foi encontrada em ${envFilePath}`);
  }

  return apiKey;
}

function spawnStitchProxy(apiKey) {
  const npxCommand = 'npx';
  const args = [
    '-y',
    'mcp-remote',
    'https://stitch.googleapis.com/mcp',
    '--transport',
    'http-only',
    '--header',
    'Accept:application/json',
    '--header',
    `X-Goog-Api-Key:${apiKey}`,
  ];

  return spawn(npxCommand, args, {
    cwd: workspaceRoot,
    shell: process.platform === 'win32',
    stdio: 'inherit',
    env: process.env,
  });
}

function main() {
  const apiKey = loadStitchApiKey();
  const child = spawnStitchProxy(apiKey);

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = code ?? 0;
  });

  child.on('error', (error) => {
    console.error('[erro] Falha ao iniciar proxy local do Stitch MCP.');
    console.error(error.message);
    process.exitCode = 1;
  });
}

try {
  main();
} catch (error) {
  console.error('[erro] Falha ao carregar configuração local do Stitch MCP.');
  console.error(error.message);
  process.exitCode = 1;
}
