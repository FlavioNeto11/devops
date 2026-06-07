import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const projectRoot = process.cwd();

const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  "docs",
  "storage"
]);

const ignoredExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".pdf",
  ".zip",
  ".har",
  ".ico",
  ".lock"
]);

const assignmentRegex =
  /\b([A-Za-z_][A-Za-z0-9_-]*)\b\s*[:=]\s*["'`]([^"'`]+)["'`]/;

const credentialKeys = new Set([
  "api_key",
  "apikey",
  "token",
  "secret",
  "password",
  "authorization",
  "bearer",
  "cookie",
  "private_key",
  "client_secret"
]);

const bearerJwtRegex = /\bBearer\s+([A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/;

const privateKeyRegex = /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;

const allowedPlaceholderFragments = [
  "<token>",
  "[redacted]",
  "***",
  "example",
  "dummy",
  "mock",
  "placeholder",
  "test",
  "senha",
  "password"
];

const findings = [];

function isIgnoredPath(relativePath) {
  if (!relativePath) {
    return false;
  }

  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized.split("/");

  if (segments.some((segment) => ignoredDirectories.has(segment))) {
    return true;
  }

  if (normalized.includes("/.")) {
    return true;
  }

  if (normalized.endsWith(".example")) {
    return true;
  }

  if (ignoredExtensions.has(extname(normalized).toLowerCase())) {
    return true;
  }

  return false;
}

function shouldSkipLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }

  return trimmed.includes("PLACEHOLDER");
}

function hasMixedCharset(value) {
  let classes = 0;
  if (/[a-z]/.test(value)) {
    classes += 1;
  }
  if (/[A-Z]/.test(value)) {
    classes += 1;
  }
  if (/\d/.test(value)) {
    classes += 1;
  }
  if (/[^A-Za-z0-9]/.test(value)) {
    classes += 1;
  }
  return classes >= 3;
}

function isLikelySecretValue(rawValue) {
  const value = rawValue.trim();
  if (!value || value.length < 16) {
    return false;
  }

  const normalized = value.toLowerCase();
  if (value.includes("${") || value.includes("{{")) {
    return false;
  }

  if (
    allowedPlaceholderFragments.some((fragment) =>
      normalized.includes(fragment)
    )
  ) {
    return false;
  }

  if (bearerJwtRegex.test(`Bearer ${value}`)) {
    return true;
  }

  return /^[A-Za-z0-9._~+/=:-]+$/.test(value) && hasMixedCharset(value) && value.length >= 24;
}

function pushFinding(relativePath, lineNumber, pattern, line) {
  findings.push({
    file: relativePath,
    line: lineNumber,
    pattern,
    snippet: line.trim().slice(0, 180)
  });
}

function checkLine(relativePath, line, lineNumber) {
  const assignmentMatch = assignmentRegex.exec(line);
  const key = assignmentMatch?.[1]?.toLowerCase();
  const value = assignmentMatch?.[2];
  if (key && value && credentialKeys.has(key) && isLikelySecretValue(value)) {
    pushFinding(relativePath, lineNumber, "credential-assignment", line);
  }

  if (bearerJwtRegex.test(line)) {
    pushFinding(relativePath, lineNumber, "bearer-jwt", line);
  }

  if (privateKeyRegex.test(line)) {
    pushFinding(relativePath, lineNumber, "private-key-block", line);
  }
}

function scanFile(absolutePath, relativePath) {
  const stats = statSync(absolutePath);
  if (stats.size > 1024 * 1024 * 2) {
    return;
  }

  const content = readFileSync(absolutePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (shouldSkipLine(line)) {
      continue;
    }

    checkLine(relativePath, line, index + 1);
  }
}

function scanDirectory(directoryPath) {
  const entries = readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(directoryPath, entry.name);
    const relativePath = relative(projectRoot, absolutePath).replaceAll("\\", "/");

    if (isIgnoredPath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(absolutePath);
      continue;
    }

    if (entry.isFile()) {
      scanFile(absolutePath, relativePath);
    }
  }
}

scanDirectory(projectRoot);

if (findings.length > 0) {
  process.stderr.write("[check:secrets] Possible secrets found:\n");
  for (const finding of findings) {
    process.stderr.write(
      `- ${finding.file}:${finding.line} (${finding.pattern}) ${finding.snippet}\n`
    );
  }
  process.exit(1);
}

process.stdout.write("[check:secrets] No obvious secrets detected.\n");
