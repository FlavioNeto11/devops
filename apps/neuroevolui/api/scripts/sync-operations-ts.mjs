import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const jsPath = path.resolve(process.cwd(), 'src/generated/operations.js');
const tsPath = path.resolve(process.cwd(), 'src/generated/operations.ts');

const mod = await import(pathToFileURL(jsPath).href);
const ops = mod.operations;

const header = `export interface OperationDefinition {
  readonly key: string;
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';
  readonly specPath: string;
  readonly expressPath: string;
  readonly summary: string;
  readonly tag: string;
  readonly successStatus: number;
}

const operationsData = `;

const footer = ` as const satisfies readonly OperationDefinition[];

export const operations: readonly OperationDefinition[] = operationsData;

export type Operation = (typeof operationsData)[number];
export type OperationKey = Operation['key'];
`;

fs.writeFileSync(tsPath, header + JSON.stringify(ops, null, 2) + footer, 'utf-8');
console.log(`[ok] sync ${ops.length} operations -> ${tsPath}`);
