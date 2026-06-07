import fs from 'node:fs';

const packagePath = 'package.json';
const raw = fs.readFileSync(packagePath, 'utf8');
const pkg = JSON.parse(raw);

pkg.scripts ||= {};

const scripts = {
  'smoke:ai-chat': 'node scripts/ai-smoke/run-sicat-ai-smoke.mjs --catalog docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl',
  'smoke:ai-chat:sample': 'node scripts/ai-smoke/run-sicat-ai-smoke.mjs --catalog docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl',
  'smoke:ai-chat:category': 'node scripts/ai-smoke/run-sicat-ai-smoke.mjs --catalog docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl --category',
  'smoke:ai-chat:dry-run': 'node scripts/ai-smoke/run-sicat-ai-smoke.mjs --catalog docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl --dry-run'
};

let changed = false;
for (const [name, command] of Object.entries(scripts)) {
  if (pkg.scripts[name] !== command) {
    pkg.scripts[name] = command;
    changed = true;
  }
}

if (changed) {
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log('package.json atualizado com scripts de smoke do Chat SICAT.');
} else {
  console.log('package.json já possui scripts de smoke do Chat SICAT.');
}
