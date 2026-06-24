import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(__dirname, '../openapi/openapi.yaml');

let _raw = null;
let _spec = null;

export function getOpenApiYamlText() {
  if (!_raw) _raw = fs.readFileSync(specPath, 'utf-8');
  return _raw;
}

export function loadOpenApiSpec() {
  if (!_spec) _spec = YAML.parse(getOpenApiYamlText());
  return _spec;
}
