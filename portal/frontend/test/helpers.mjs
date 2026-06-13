import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Lê um arquivo do diretório do portal (../<rel>) como string UTF-8. */
export function readFrontend(rel) {
  return readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
}

/** Conta ocorrências de uma regex global numa string. */
export function count(str, re) {
  const m = str.match(re);
  return m ? m.length : 0;
}
