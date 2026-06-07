import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { config } from './config.js';

let cachedText: string | null = null;
let cachedSpec: Record<string, unknown> | null = null;

function resolveOpenApiPath() {
  return path.resolve(process.cwd(), config.openApiFile);
}

export function getOpenApiYamlText(): string {
  if (!cachedText) {
    cachedText = fs.readFileSync(resolveOpenApiPath(), 'utf-8');
  }
  return cachedText;
}

export function loadOpenApiSpec<T extends Record<string, unknown> = Record<string, unknown>>(): T {
  if (!cachedSpec) {
    cachedSpec = YAML.parse(getOpenApiYamlText()) as Record<string, unknown>;
  }
  return cachedSpec as T;
}

type OpenApiContent = {
  example?: unknown;
};

type OpenApiResponse = {
  content?: Record<string, OpenApiContent>;
};

export function getOperationSuccessExample(
  specPath: string,
  method: string,
  successStatus: number
): unknown {
  const spec = loadOpenApiSpec();
  const paths = spec.paths as Record<string, unknown> | undefined;
  if (!paths || typeof paths !== 'object') return null;

  const pathItem = paths[specPath] as Record<string, unknown> | undefined;
  if (!pathItem || typeof pathItem !== 'object') return null;

  const operation = pathItem[method.toLowerCase()] as Record<string, unknown> | undefined;
  if (!operation || typeof operation !== 'object') return null;

  const responses = operation.responses as Record<string, OpenApiResponse> | undefined;
  if (!responses || typeof responses !== 'object') return null;

  const response = responses[String(successStatus)];
  if (!response) return null;

  const jsonContent = response.content?.['application/json'];
  if (jsonContent && Object.prototype.hasOwnProperty.call(jsonContent, 'example')) {
    return jsonContent.example;
  }

  const problemContent = response.content?.['application/problem+json'];
  if (problemContent && Object.prototype.hasOwnProperty.call(problemContent, 'example')) {
    return problemContent.example;
  }

  return null;
}
