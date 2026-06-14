// =============================================================================
// source-paths.mjs — validação PURA e testável de `source.source_paths` (origem).
// Usada pelo build-baseline (enforce de origem). Fecha as brechas que a auditoria
// adversarial achou no enforce: `..` no MEIO do caminho e SYMLINK escapando da raiz.
//
// Regra: caminho relativo à raiz do repo, SEM segmento `..` em lugar nenhum, sem
// raiz absoluta/drive, e cujo destino REAL (resolvendo symlinks) fique DENTRO do
// repo e EXISTA. Qualquer fuga -> inválido ("origem fabricada / fora do repo").
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';

// Pura: decide validade SEM tocar o FS (formato + traversal). Retorna {ok, reason}.
export function checkSourcePathShape(sp) {
  if (typeof sp !== 'string' || !sp.trim()) return { ok: false, reason: 'vazio/não-string' };
  const norm = sp.replace(/\\/g, '/');
  if (/^([a-zA-Z]:[\\/]|\/)/.test(norm)) return { ok: false, reason: 'caminho absoluto (use relativo à raiz do repo)' };
  // `..` em QUALQUER segmento (não só no início) — bloqueia traversal no meio do path.
  if (norm.split('/').some((seg) => seg === '..')) return { ok: false, reason: "segmento '..' proibido (traversal)" };
  return { ok: true };
}

// Com FS: aplica a forma + confirma que o destino REAL fica dentro do repo e existe.
// `realpathSync` (injetável p/ teste) resolve symlinks; comparamos o caminho real
// contra a raiz real do repo — symlink apontando p/ fora reprova.
export function validateSourcePath(sp, repoRoot, deps = {}) {
  const shape = checkSourcePathShape(sp);
  if (!shape.ok) return shape;
  const existsSync = deps.existsSync || fs.existsSync;
  const realpathSync = deps.realpathSync || fs.realpathSync;
  const full = path.resolve(repoRoot, sp.replace(/\\/g, '/'));
  const rootReal = (() => { try { return realpathSync(repoRoot); } catch { return path.resolve(repoRoot); } })();
  if (!existsSync(full)) return { ok: false, reason: 'inexistente (origem fabricada? o caminho não existe no repo)' };
  let real;
  try { real = realpathSync(full); } catch { return { ok: false, reason: 'não resolvível' }; }
  const within = (child, parent) => {
    const rel = path.relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };
  if (!within(real, rootReal)) return { ok: false, reason: 'destino fora da raiz do repo (symlink/escape)' };
  return { ok: true };
}
