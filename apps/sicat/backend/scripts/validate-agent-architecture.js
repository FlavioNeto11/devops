import fs from 'node:fs';
import path from 'node:path';

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(absPath) {
  ensure(fs.existsSync(absPath), `Arquivo ausente: ${absPath}`);
  return fs.readFileSync(absPath, 'utf8');
}

function listFiles(dir, suffix) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .map((name) => path.join(dir, name));
}

function parseFrontmatter(text, fileLabel) {
  const lines = text.split(/\r?\n/);

  let startIndex = 0;
  const first = lines[0]?.trim();

  if (first?.startsWith('```')) {
    startIndex = 1;
  }

  ensure(lines[startIndex]?.trim() === '---', `${fileLabel}: frontmatter YAML deve iniciar com '---' (direto ou após fence).`);
  const end = lines.findIndex((line, index) => index > startIndex && line.trim() === '---');
  ensure(end > 1, `${fileLabel}: frontmatter YAML inválido ou não encerrado.`);
  const yaml = lines.slice(startIndex + 1, end).join('\n');
  return yaml;
}

function getYamlValue(yaml, key) {
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, 'm');
  const match = yaml.match(pattern);
  return match ? match[1].trim() : null;
}

function getYamlKeys(yaml) {
  return yaml
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*/)?.[1])
    .filter(Boolean);
}

function validateAgentFiles(rootDir) {
  const agentsDir = path.resolve(rootDir, '.github/agents');
  const agentFiles = listFiles(agentsDir, '.agent.md');
  const names = new Set();

  ensure(agentFiles.length > 0, 'Nenhum arquivo .agent.md encontrado em .github/agents.');

  for (const filePath of agentFiles) {
    const rel = path.relative(rootDir, filePath).replaceAll('\\', '/');
    const content = readText(filePath);

    ensure(!content.includes('```chatagent'), `${rel}: remover fence \`\`\`chatagent; usar apenas frontmatter YAML.`);

    const yaml = parseFrontmatter(content, rel);
    const name = getYamlValue(yaml, 'name');
    const description = getYamlValue(yaml, 'description');
    const target = getYamlValue(yaml, 'target');

    ensure(name, `${rel}: campo obrigatório ausente no frontmatter: name.`);
    ensure(description, `${rel}: campo obrigatório ausente no frontmatter: description.`);
    ensure(target === 'vscode', `${rel}: target deve ser 'vscode'.`);
    ensure(!names.has(name), `${rel}: nome de agente duplicado '${name}'.`);

    names.add(name);
  }

  return names;
}

function validatePromptMappings(rootDir, agentNames) {
  const promptsDir = path.resolve(rootDir, '.github/prompts');
  const promptFiles = listFiles(promptsDir, '.prompt.md');
  const allowedPromptKeys = new Set(['name', 'description', 'agent', 'argument-hint', 'model', 'tools']);

  for (const filePath of promptFiles) {
    const rel = path.relative(rootDir, filePath).replaceAll('\\', '/');
    const content = readText(filePath);
    const yaml = parseFrontmatter(content, rel);
    const yamlKeys = getYamlKeys(yaml);
    const agent = getYamlValue(yaml, 'agent');
    const name = getYamlValue(yaml, 'name');
    const description = getYamlValue(yaml, 'description');

    ensure(name, `${rel}: prompt sem campo obrigatório 'name'.`);
    ensure(description, `${rel}: prompt sem campo obrigatório 'description'.`);

    for (const key of yamlKeys) {
      ensure(allowedPromptKeys.has(key), `${rel}: chave de frontmatter não suportada '${key}'.`);
    }

    ensure(!yamlKeys.includes('template'), `${rel}: chave 'template' não é suportada no runtime atual.`);

    ensure(!content.includes('{{'), `${rel}: sintaxe '{{...}}' não suportada; use placeholders nativos do VS Code (input placeholders).`);

    if (!agent) continue;
    ensure(agentNames.has(agent), `${rel}: prompt referencia agente inexistente '${agent}'.`);
  }
}

function validateOrchestratorHandoffs(rootDir, agentNames) {
  const orchestratorPath = path.resolve(rootDir, '.github/agents/orquestrador-mtr.agent.md');
  const rel = path.relative(rootDir, orchestratorPath).replaceAll('\\', '/');
  const content = readText(orchestratorPath);

  const handoffAgents = [...content.matchAll(/^\s*agent:\s*([^\r\n]+)$/gm)].map((match) => match[1].trim());

  ensure(handoffAgents.length > 0, `${rel}: nenhum handoff.agent encontrado.`);

  for (const handoffAgent of handoffAgents) {
    ensure(agentNames.has(handoffAgent), `${rel}: handoff aponta para agente inexistente '${handoffAgent}'.`);
  }
}

try {
  const rootDir = process.cwd();
  const agentNames = validateAgentFiles(rootDir);
  validatePromptMappings(rootDir, agentNames);
  validateOrchestratorHandoffs(rootDir, agentNames);

  console.log('[ok] Arquitetura de agentes validada com sucesso.');
  console.log(`- agentes validados: ${agentNames.size}`);
} catch (error) {
  console.error('[erro] Falha na validação da arquitetura de agentes');
  console.error(error);
  process.exitCode = 1;
}
