import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const scanTargets = ['docs', '.github', 'README.md'];
const reportPath = path.join(projectRoot, 'docs', 'copilot', 'auditoria-links-quebrados.md');

function getMarkdownFiles() {
  const files = [];

  for (const target of scanTargets) {
    const absoluteTarget = path.join(projectRoot, target);
    if (!fs.existsSync(absoluteTarget)) {
      continue;
    }

    const stats = fs.statSync(absoluteTarget);
    if (stats.isFile()) {
      if (absoluteTarget.toLowerCase().endsWith('.md')) {
        files.push(absoluteTarget);
      }
      continue;
    }

    walkDirectory(absoluteTarget, files);
  }

  return files;
}

function walkDirectory(directoryPath, files) {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(absolutePath, files);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(absolutePath);
    }
  }
}

function toRelativePath(absoluteFilePath) {
  return path.relative(projectRoot, absoluteFilePath).replaceAll('\\', '/');
}

function slugifyHeading(heading) {
  const normalized = heading
    .toLowerCase()
    .trim()
    .replaceAll(/[`*_~\[\](){}.,:;!?"'\/\\|@#$%^&+=<>]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '');

  return normalized;
}

function collectAnchors(markdownFiles) {
  const anchorsByFile = new Map();

  for (const filePath of markdownFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const anchors = new Set();

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (!match) {
        continue;
      }

      const slug = slugifyHeading(match[2]);
      if (slug) {
        anchors.add(slug);
      }
    }

    anchorsByFile.set(filePath, anchors);
  }

  return anchorsByFile;
}

function isExternalOrIgnoredLink(rawLink) {
  if (!rawLink) {
    return true;
  }

  return /^(https?:|mailto:|tel:|data:|\$\{)/i.test(rawLink);
}

function parseMarkdownLinks(content) {
  const links = [];
  const pattern = /\[[^\]]+\]\(([^)]+)\)/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    links.push(match[1].trim());
  }

  return links;
}

function resolveTargetPath(originFilePath, pathPart) {
  if (!pathPart) {
    return originFilePath;
  }

  if (/[\*|]/.test(pathPart)) {
    return null;
  }

  const resolvedAbsolute = path.isAbsolute(pathPart)
    ? pathPart
    : path.resolve(path.dirname(originFilePath), pathPart);

  if (!fs.existsSync(resolvedAbsolute)) {
    return null;
  }

  return resolvedAbsolute;
}

function validateMarkdownLinks(markdownFiles, anchorsByFile) {
  const issues = [];

  for (const filePath of markdownFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const links = parseMarkdownLinks(content);

    for (let rawLink of links) {
      if (rawLink.startsWith('<') && rawLink.endsWith('>')) {
        rawLink = rawLink.slice(1, -1);
      }

      const normalizedLink = rawLink.split(/\s+/)[0]?.trim();
      if (!normalizedLink || isExternalOrIgnoredLink(normalizedLink)) {
        continue;
      }

      const [pathPart, fragment] = normalizedLink.split('#', 2);
      const targetPath = resolveTargetPath(filePath, pathPart);

      if (!targetPath) {
        issues.push({
          type: 'broken-path',
          file: toRelativePath(filePath),
          link: normalizedLink,
          target: pathPart || '(mesmo arquivo)'
        });
        continue;
      }

      if (!fragment) {
        continue;
      }

      const targetStat = fs.statSync(targetPath);
      if (targetStat.isDirectory() || path.extname(targetPath).toLowerCase() !== '.md') {
        continue;
      }

      const expectedAnchor = slugifyHeading(decodeURIComponent(fragment));
      const targetAnchors = anchorsByFile.get(targetPath);
      if (!targetAnchors || !targetAnchors.has(expectedAnchor)) {
        issues.push({
          type: 'broken-anchor',
          file: toRelativePath(filePath),
          link: normalizedLink,
          target: `${toRelativePath(targetPath)}#${expectedAnchor}`
        });
      }
    }
  }

  return issues;
}

function writeReport(markdownFiles, issues) {
  const brokenPathCount = issues.filter((issue) => issue.type === 'broken-path').length;
  const brokenAnchorCount = issues.filter((issue) => issue.type === 'broken-anchor').length;

  const reportLines = [
    '# Auditoria de links e âncoras',
    '',
    `Data: ${new Date().toISOString()}`,
    '',
    'Critério: links markdown locais por caminho + validação de âncoras em arquivos `.md`.',
    '',
    '## Resumo',
    `- Arquivos analisados: ${markdownFiles.length}`,
    `- Problemas encontrados: ${issues.length}`,
    `- Quebras de caminho: ${brokenPathCount}`,
    `- Quebras de âncora: ${brokenAnchorCount}`,
    '',
    '## Detalhes',
    ''
  ];

  if (issues.length === 0) {
    reportLines.push('- Nenhum problema encontrado.');
  } else {
    const orderedIssues = [...issues].sort((left, right) => {
      if (left.type !== right.type) return left.type.localeCompare(right.type);
      if (left.file !== right.file) return left.file.localeCompare(right.file);
      return left.link.localeCompare(right.link);
    });

    for (const issue of orderedIssues) {
      reportLines.push(
        `- Tipo: \`${issue.type}\` | Arquivo: \`${issue.file}\` | Link: \`${issue.link}\` | Alvo: \`${issue.target}\``
      );
    }
  }

  const nextContent = `${reportLines.join('\n')}\n`;

  if (fs.existsSync(reportPath)) {
    const currentContent = fs.readFileSync(reportPath, 'utf8');
    const normalizeWithoutTimestamp = (value) =>
      value.replace(/^Data:\s+.*$/m, 'Data: <preservado>');

    // Avoid churn when the only delta is the timestamp line.
    if (normalizeWithoutTimestamp(currentContent) === normalizeWithoutTimestamp(nextContent)) {
      return false;
    }
  }

  fs.writeFileSync(reportPath, nextContent, 'utf8');
  return true;
}

function main() {
  try {
    const markdownFiles = getMarkdownFiles();
    const anchorsByFile = collectAnchors(markdownFiles);
    const issues = validateMarkdownLinks(markdownFiles, anchorsByFile);

    const reportUpdated = writeReport(markdownFiles, issues);

    console.log(`[ok] Arquivos analisados: ${markdownFiles.length}`);
    console.log(`[ok] Relatório: ${toRelativePath(reportPath)}`);
    console.log(`[ok] Relatório atualizado: ${reportUpdated ? 'sim' : 'nao (sem mudancas reais)'}`);

    if (issues.length > 0) {
      console.error(`[erro] Foram encontrados ${issues.length} problema(s) de links/âncoras.`);
      process.exitCode = 1;
      return;
    }

    console.log('[ok] Nenhum problema de links/âncoras encontrado.');
  } catch (error) {
    console.error('[erro] Falha na validação de links/âncoras markdown.');
    console.error(error);
    process.exitCode = 1;
  }
}

main();
