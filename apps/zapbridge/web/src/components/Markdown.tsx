import { ReactNode } from 'react';

// Renderer de markdown leve (sem deps): negrito/itálico/código/links inline +
// títulos, listas, citação, regra, blocos de código. Suficiente p/ respostas da IA.
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = keyBase + '-' + i++;
    if (tok.startsWith('**') || tok.startsWith('__')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k} className="bg-black/40 rounded px-1 text-[0.9em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const mm = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(tok);
      if (mm) out.push(<a key={k} href={mm[2]} target="_blank" rel="noreferrer" className="text-link underline">{mm[1]}</a>);
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;

  const flushList = (key: string) => {
    if (!list) return;
    const L = list;
    blocks.push(
      L.ordered ? (
        <ol key={key} className="list-decimal ml-5 my-1 space-y-0.5">
          {L.items.map((it, i) => <li key={i}>{inline(it, key + i)}</li>)}
        </ol>
      ) : (
        <ul key={key} className="list-disc ml-5 my-1 space-y-0.5">
          {L.items.map((it, i) => <li key={i}>{inline(it, key + i)}</li>)}
        </ul>
      ),
    );
    list = null;
  };

  lines.forEach((raw, idx) => {
    const key = 'b' + idx;
    if (raw.trim().startsWith('```')) {
      if (code) {
        blocks.push(<pre key={key} className="bg-black/40 rounded-lg p-2 my-1 overflow-x-auto text-[13px]"><code>{code.join('\n')}</code></pre>);
        code = null;
      } else {
        flushList(key + 'l');
        code = [];
      }
      return;
    }
    if (code) {
      code.push(raw);
      return;
    }
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (h) {
      flushList(key + 'l');
      const sz = h[1].length === 1 ? 'text-lg' : h[1].length === 2 ? 'text-base' : 'text-sm';
      blocks.push(<div key={key} className={`font-bold ${sz} mt-2 mb-1`}>{inline(h[2], key)}</div>);
    } else if (ol) {
      if (!list || !list.ordered) { flushList(key + 'l'); list = { ordered: true, items: [] }; }
      list.items.push(ol[1]);
    } else if (ul) {
      if (!list || list.ordered) { flushList(key + 'l'); list = { ordered: false, items: [] }; }
      list.items.push(ul[1]);
    } else if (line.trim() === '') {
      flushList(key + 'l');
    } else if (/^(---|\*\*\*)$/.test(line.trim())) {
      flushList(key + 'l');
      blocks.push(<hr key={key} className="border-line my-2" />);
    } else {
      flushList(key + 'l');
      blocks.push(<p key={key} className="my-1 leading-relaxed whitespace-pre-wrap break-words">{inline(line, key)}</p>);
    }
  });
  flushList('bend');
  if (code) blocks.push(<pre key="bendc" className="bg-black/40 rounded-lg p-2 my-1 overflow-x-auto text-[13px]"><code>{(code as string[]).join('\n')}</code></pre>);

  return <div className="text-[15px] text-white [&>*:first-child]:mt-0">{blocks}</div>;
}
