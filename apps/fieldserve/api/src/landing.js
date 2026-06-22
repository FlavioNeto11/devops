// landing.js — página de status servida na RAIZ do app (navegável no browser, não só API).
export function landingHtml({ title, base, stack, caps }) {
  const chips = (caps || []).map((c) => '<span class="chip">' + c + '</span>').join('');
  return [
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title>',
    '<style>',
    ':root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0b0d12;color:#e6e9ef;display:grid;place-items:center;min-height:100vh;padding:1.5rem}',
    '.card{max-width:680px;width:100%;background:#11151d;border:1px solid #232a36;border-radius:16px;padding:2.2rem}',
    '.live{display:inline-flex;align-items:center;gap:.4rem;background:#13321f;color:#4ade80;padding:.25rem .7rem;border-radius:999px;font-size:.78rem;font-weight:600}',
    '.live::before{content:"";width:8px;height:8px;border-radius:50%;background:#4ade80}',
    'h1{margin:.7rem 0 .2rem;font-size:1.7rem}.sub{color:#94a3b8;margin:0 0 1.2rem}',
    '.chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:1rem 0}.chip{background:#1a2030;color:#cbd5e1;border:1px solid #2a3344;border-radius:8px;padding:.25rem .6rem;font-size:.82rem}',
    '.links{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.4rem}.links a{background:#1f2937;color:#e6e9ef;border:1px solid #2f3a4b;border-radius:10px;padding:.6rem 1rem;text-decoration:none;font-size:.9rem}.links a:hover{background:#283242}.links a.p{background:#4f46e5;border-color:#4f46e5}',
    'code{background:#1a2030;padding:.1rem .4rem;border-radius:6px;font-size:.85rem}',
    '</style></head><body><div class="card">',
    '<span class="live">no ar</span>',
    '<h1>' + title + '</h1>',
    '<p class="sub">Aplicação gerada pela <strong>Forge</strong> (' + stack + '-style). API REST em <code>' + base + '/api</code>.</p>',
    '<div class="chips">' + chips + '</div>',
    '<div class="links"><a class="p" href="' + base + '/api/health">Ver health da API</a><a href="/reqs/#/forge">← Forge</a></div>',
    '</div></body></html>',
  ].join('');
}
