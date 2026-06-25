import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';
import { useToast } from '../ToastProvider.jsx';
import { pmProjects, pmCreateProject, pmCmsCreatePage, pmCmsCreateSection, pmCmsUpload, pmCmsGenerateStream } from '../../api.js';
import { isPortal } from '../../lib/appTypes.js';

/**
 * NewPortalWizard — criação de um portal CMS com identidade PRÓPRIA (key,
 * cms_site, páginas e publicação próprios). O vínculo com um produto/sistema
 * existente é OPCIONAL e relacional. Governança: admin cria já aprovado; member
 * cria como pendente de aprovação.
 *
 * A criação é AO VIVO e transparente: cada etapa (projeto → página → conteúdo
 * inicial → envio de arquivos → leitura/ingestão → IA montando o site →
 * validação da estrutura → publicação) aparece com status e log em tempo real,
 * via stream SSE da geração (pmCmsGenerateStream). O modal NÃO congela.
 */
const slugify = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const fmtSize = (n) => {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

// Template inicial de conteúdo (kinds genéricos; o criador evolui no editor).
const TEMPLATES = {
  blank: { label: 'Em branco (só a página Home)', sections: [] },
  basic: {
    label: 'Básico (título + texto + chamada)',
    sections: [
      { kind: 'section-heading', data: { eyebrow: 'Bem-vindo', title: 'Novo portal', titleAccent: '', subtitle: 'Edite este conteúdo no editor visual.', center: true } },
      { kind: 'rich-text', data: { eyebrow: '', heading: 'Sobre', html: '<p>Apresente aqui a empresa, o profissional ou o projeto.</p>' } },
      { kind: 'cta', data: { title: 'Vamos conversar', titleAccent: '', titleTail: '?', text: '', buttons: [{ label: 'Entrar em contato', kind: 'proposal', href: '' }] } },
    ],
  },
};

// Etapas exibidas (ordem). upload/ingest só com arquivos; ai/validate/persist só com IA.
const STAGE_ORDER = ['project', 'page', 'template', 'upload', 'ingest', 'ai', 'validate', 'persist'];
const STAGE_LABEL = {
  project: 'Criando o projeto',
  page: 'Criando a página inicial',
  template: 'Aplicando o conteúdo inicial',
  upload: 'Enviando arquivos',
  ingest: 'Lendo os arquivos',
  ai: 'IA montando o site',
  validate: 'Validando a estrutura',
  persist: 'Publicando o conteúdo',
};

function StageRow({ label, stage, extra }) {
  const st = stage?.status || 'pending';
  if (st === 'skip') return null;
  const ind = st === 'done' ? <Icon name="check" size={14} />
    : st === 'error' ? <Icon name="x" size={14} />
      : st === 'active' ? <span className="spin" style={{ display: 'inline-flex' }}><Icon name="refresh" size={14} /></span>
        : <span className="dot" />;
  const color = st === 'done' ? 'var(--ok)' : st === 'error' ? 'var(--err)' : undefined;
  return (
    <div className={`gp-stage gp-stage--${st}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '5px 0' }}>
      <span style={{ flex: 'none', width: 16, textAlign: 'center', color }}>{ind}</span>
      <span style={{ flex: 'none', minWidth: 168, fontWeight: st === 'active' ? 600 : 500 }}>{label}</span>
      <span className="muted" style={{ fontSize: '.8rem' }}>{stage?.detail || ''}{extra ? <strong style={{ marginLeft: 6 }}>{extra}</strong> : null}</span>
    </div>
  );
}

export default function NewPortalWizard({ isAdmin, onClose, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [template, setTemplate] = useState('basic');
  const [linkMode, setLinkMode] = useState('independent'); // independent | linked
  const [relatedId, setRelatedId] = useState('');
  const [products, setProducts] = useState([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [files, setFiles] = useState([]);

  // fluxo ao vivo
  const [phase, setPhase] = useState('form'); // form | running | done | error
  const [stages, setStages] = useState({});
  const [log, setLog] = useState([]);
  const [aiElapsed, setAiElapsed] = useState(0);
  const [report, setReport] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const abortRef = useRef(null);
  const createdRef = useRef(null);   // { project, fileIds } — p/ "tentar de novo" sem recriar
  const aiTimer = useRef(null);
  const cancelled = useRef(false);

  useEffect(() => {
    pmProjects().then((p) => setProducts((p || []).filter((x) => !isPortal(x)))).catch(() => setProducts([]));
    return () => { if (aiTimer.current) clearInterval(aiTimer.current); };
  }, []);

  const effectiveKey = useMemo(() => (keyTouched ? key : slugify(name)), [key, keyTouched, name]);
  const keyClash = products.some((p) => p.key === effectiveKey);

  const setStage = (k, status, detail) => setStages((s) => ({ ...s, [k]: { status, detail: detail ?? s[k]?.detail ?? '' } }));
  const addLog = (text) => setLog((l) => [...l, text]);

  const startAiTimer = () => {
    const t0 = Date.now();
    setAiElapsed(0);
    if (aiTimer.current) clearInterval(aiTimer.current);
    aiTimer.current = setInterval(() => setAiElapsed(Date.now() - t0), 250);
  };
  const stopAiTimer = () => { if (aiTimer.current) { clearInterval(aiTimer.current); aiTimer.current = null; } };

  const onSse = (event, data) => {
    switch (event) {
      case 'ingest-start':
        setStage('ingest', 'active', `${data.count || 0} arquivo(s)`);
        (data.files || []).forEach((f) => addLog(`Lendo ${f.name} (${fmtSize(f.size)})`));
        break;
      case 'ingest-done':
        setStage('ingest', 'done', `${data.textParts || 0} texto(s) · ${data.images || 0} imagem(ns) · ${data.blocks || 0} bloco(s)`);
        (data.notes || []).forEach((n) => addLog(`Nota de ingestão: ${n}`));
        break;
      case 'ai-start':
        setStage('ai', 'active', `modelo ${data.model}${data.multimodal ? ` · ${data.images} imagem(ns)` : ''}`);
        addLog(`IA montando o site (identidade, paleta, hero e seções)…`);
        startAiTimer();
        break;
      case 'ai-done':
        stopAiTimer();
        setStage('ai', 'done', `${(Number(data.elapsedMs || 0) / 1000).toFixed(1)}s`);
        break;
      case 'validate': {
        stopAiTimer();
        setReport(data);
        setStage('validate', 'done', `${data.pagesKept || 0} página(s) · ${data.sectionsKept || 0} seção(ões)${data.sectionsDropped ? ` · ${data.sectionsDropped} descartada(s)` : ''}`);
        if (data.reinforced) addLog('Estrutura reforçada: a IA não entregou um hero — sintetizei um a partir da identidade.');
        if (data.sectionsDropped) addLog(`Seções inválidas descartadas (${(data.droppedKinds || []).join(', ') || data.sectionsDropped}).`);
        if (!data.paletteValid) addLog('Paleta sem cores válidas — usando a do tema padrão.');
        break;
      }
      case 'persist':
        setStage('persist', 'done', `${data.created?.pages || 0} página(s) · ${data.created?.sections || 0} seção(ões) ${data.published ? 'publicadas' : 'em rascunho'}`);
        break;
      default:
        break;
    }
  };

  const run = async () => {
    const k = slugify(effectiveKey);
    if (!name.trim() || !k) { toast.err('Informe o nome do portal.'); return; }
    const useFiles = files.length > 0;
    const useAI = useFiles || aiPrompt.trim().length > 0;

    // inicializa as etapas (skip nas que não se aplicam)
    const init = {};
    for (const sk of STAGE_ORDER) init[sk] = { status: 'pending', detail: '' };
    if (!useFiles) { init.upload.status = 'skip'; init.ingest.status = 'skip'; }
    if (!useAI) { init.ai.status = 'skip'; init.validate.status = 'skip'; init.persist.status = 'skip'; }
    setStages(init); setLog([]); setErr(''); setResult(null); setReport(null);
    cancelled.current = false;
    abortRef.current = new AbortController();
    setPhase('running');

    try {
      // projeto/página/template: só na 1ª vez (em "tentar de novo" já existem)
      let project = createdRef.current?.project;
      if (!project) {
        setStage('project', 'active');
        project = await pmCreateProject({
          key: k, name: name.trim(), app_type: 'cms_portal',
          route: `/sites/${k}`, stack: 'Portal CMS',
          related_project_id: linkMode === 'linked' && relatedId ? relatedId : null,
        });
        createdRef.current = { project, fileIds: [] };
        setStage('project', 'done', `/sites/${k}`); addLog(`Projeto "${name.trim()}" criado em /sites/${k}.`);

        setStage('page', 'active');
        const page = await pmCmsCreatePage(project.id, { slug: 'home', title: 'Home', status: isAdmin ? 'published' : 'draft' });
        setStage('page', 'done');

        const tplSections = TEMPLATES[template]?.sections || [];
        setStage('template', 'active');
        for (const s of tplSections) {
          // eslint-disable-next-line no-await-in-loop
          await pmCmsCreateSection(page.id, { kind: s.kind, data: s.data, status: 'published', visible: true });
        }
        setStage('template', 'done', tplSections.length ? `${tplSections.length} seção(ões) base` : 'em branco');
      } else {
        setStage('project', 'done', `/sites/${k}`); setStage('page', 'done'); setStage('template', 'done');
      }

      // upload dos arquivos (se houver e ainda não enviados)
      let fileIds = createdRef.current.fileIds || [];
      if (useFiles && !fileIds.length) {
        setStage('upload', 'active', `0/${files.length}`);
        fileIds = [];
        for (let i = 0; i < files.length; i++) {
          setStage('upload', 'active', `${i + 1}/${files.length} — ${files[i].name}`);
          addLog(`Enviando ${files[i].name} (${fmtSize(files[i].size)})…`);
          // eslint-disable-next-line no-await-in-loop
          const up = await pmCmsUpload(project.id, files[i]);
          fileIds.push(up.id);
        }
        createdRef.current.fileIds = fileIds;
        setStage('upload', 'done', `${files.length} arquivo(s)`);
      } else if (useFiles) {
        setStage('upload', 'done', `${fileIds.length} arquivo(s)`);
      }

      // geração AO VIVO (stream)
      if (useAI) {
        const ctx = linkMode === 'linked' && relatedId ? { relatedProjectId: relatedId } : {};
        const r = await pmCmsGenerateStream(project.id, { prompt: aiPrompt.trim(), fileIds, template, context: ctx }, {
          onEvent: onSse, signal: abortRef.current.signal,
        });
        setResult({ project, ...(r || {}) });
      } else {
        setResult({ project, key: k, url: `/sites/${k}`, published: !!isAdmin, created: { pages: 1, sections: (TEMPLATES[template]?.sections || []).length } });
      }
      stopAiTimer();
      setPhase('done');
      onCreated?.(project);
    } catch (e) {
      stopAiTimer();
      if (cancelled.current) return; // cancelamento do usuário não é erro
      setErr(e?.message || String(e));
      setStages((s) => {
        const next = { ...s };
        const active = STAGE_ORDER.find((kk) => next[kk]?.status === 'active');
        if (active) next[active] = { ...next[active], status: 'error' };
        return next;
      });
      setPhase('error');
    }
  };

  const cancel = () => {
    cancelled.current = true;
    stopAiTimer();
    if (abortRef.current) abortRef.current.abort();
    onClose();
  };

  const closeOrCancel = () => { if (phase === 'running') cancel(); else onClose(); };

  // ---- render: formulário (phase=form) ou progresso (running/done/error) ----
  const footer = phase === 'form' ? (
    <>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn--primary" disabled={!name.trim() || keyClash} onClick={run}>Criar portal</button>
    </>
  ) : phase === 'running' ? (
    <button className="btn" onClick={cancel}>Cancelar</button>
  ) : phase === 'done' ? (
    <>
      {result?.url && <a className="btn" href={result.url} target="_blank" rel="noopener noreferrer">Abrir portal ↗</a>}
      <button className="btn btn--primary" onClick={onClose}>Concluir</button>
    </>
  ) : (
    <>
      <button className="btn" onClick={onClose}>Fechar</button>
      <button className="btn btn--primary" onClick={run}>Tentar de novo</button>
    </>
  );

  return (
    <Modal title="Novo portal (CMS)" size="md" onClose={closeOrCancel} footer={footer}>
      {phase === 'form' ? (
        <>
          <label className="field" style={{ marginBottom: 10 }}>
            <span className="field__label">Nome do portal</span>
            <input className="input" placeholder="ex.: Clínica Horizonte" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field" style={{ marginBottom: 10 }}>
            <span className="field__label">Endereço do site (gerado a partir do nome)</span>
            <input className="input" placeholder="ex.: clinica-horizonte" value={effectiveKey}
              onChange={(e) => { setKeyTouched(true); setKey(slugify(e.target.value)); }} />
            {effectiveKey && !keyClash && (
              <span className="muted" style={{ fontSize: '.78rem' }}>O site ficará em <strong>/sites/{effectiveKey}</strong> — no ar assim que for criado{!isAdmin ? ' e aprovado' : ''}.</span>
            )}
            {keyClash && <span style={{ color: 'var(--err)', fontSize: '.8rem' }}>Este endereço já pertence a um produto existente — escolha outro.</span>}
          </label>
          <label className="field" style={{ marginBottom: 10 }}>
            <span className="field__label">Conteúdo inicial</span>
            <select className="select" value={template} onChange={(e) => setTemplate(e.target.value)}>
              {Object.entries(TEMPLATES).map(([k2, t]) => <option key={k2} value={k2}>{t.label}</option>)}
            </select>
          </label>

          <div className="field" style={{ marginBottom: 6 }}>
            <span className="field__label">Relacionamento</span>
            <label className="check-inline" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingBottom: 6 }}>
              <input type="radio" name="linkmode" checked={linkMode === 'independent'} onChange={() => setLinkMode('independent')} />
              <span><strong>Criar portal independente</strong><br />
                <span className="muted" style={{ fontSize: '.8rem' }}>O portal tem identidade, conteúdo e publicação próprios.</span></span>
            </label>
            <label className="check-inline" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="radio" name="linkmode" checked={linkMode === 'linked'} onChange={() => setLinkMode('linked')} />
              <span><strong>Vincular este portal a um produto/sistema existente</strong><br />
                <span className="muted" style={{ fontSize: '.8rem' }}>
                  O vínculo é apenas relacional — serve para contexto, IA, governança e relatórios.
                  Ele <strong>não</strong> substitui o produto nem reutiliza a chave dele.
                </span></span>
            </label>
            {linkMode === 'linked' && (
              <select className="select" style={{ marginTop: 8 }} value={relatedId} onChange={(e) => setRelatedId(e.target.value)}>
                <option value="">selecione o produto/sistema…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
              </select>
            )}
          </div>

          <label className="field" style={{ marginBottom: 10 }}>
            <span className="field__label">Descreva o portal para a IA gerar um rascunho (opcional)</span>
            <textarea className="input" rows={3} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="ex.: site institucional de uma clínica de fisioterapia em Campinas, tom acolhedor, seções de serviços, equipe e contato" />
            <span className="muted" style={{ fontSize: '.78rem' }}>
              A IA monta o site completo (identidade, paleta, hero e seções) a partir da descrição — e você acompanha
              cada etapa ao vivo. Criado por <strong>administrador</strong>, o portal já nasce <strong>publicado</strong> em /sites/&lt;chave&gt;;
              por membro, entra como rascunho até a aprovação. Tudo fica marcado como “gerado por IA” e é editável.
            </span>
          </label>

          <label className="field" style={{ marginBottom: 10 }}>
            <span className="field__label">Ou envie arquivos para a IA usar como base (opcional)</span>
            <input className="input" type="file" multiple
              accept=".md,.txt,.csv,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,image/*"
              onChange={(e) => setFiles(Array.from(e.target.files || []))} />
            <span className="muted" style={{ fontSize: '.78rem' }}>
              Aceita .md, .txt, .csv, .pdf, .docx, .xlsx, .pptx, .zip e imagens. A IA lê o conteúdo e monta o portal a partir dele.
              {files.length > 0 && <><br /><strong>{files.length}</strong> arquivo(s): {files.map((f) => f.name).join(', ')}</>}
            </span>
          </label>

          {!isAdmin && (
            <p className="muted" style={{ fontSize: '.82rem', display: 'flex', gap: 6, alignItems: 'center' }}>
              <Icon name="info" size={14} /> O portal será criado como <strong>pendente de aprovação</strong>:
              você já monta o conteúdo, mas ele só vai ao ar após o administrador aprovar.
            </p>
          )}
        </>
      ) : (
        <div className="gp">
          <p className="muted" style={{ fontSize: '.82rem', marginTop: 0 }}>
            {phase === 'done' ? 'Portal criado.' : phase === 'error' ? 'A criação parou numa etapa.' : 'Criando o portal ao vivo…'}
            {' '}<strong>{name.trim()}</strong> → <code>/sites/{slugify(effectiveKey)}</code>
          </p>

          <div className="gp-stages" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
            {STAGE_ORDER.map((sk) => (
              <StageRow key={sk} label={STAGE_LABEL[sk]} stage={stages[sk]}
                extra={sk === 'ai' && stages.ai?.status === 'active' ? `${(aiElapsed / 1000).toFixed(0)}s` : null} />
            ))}
          </div>

          {report && (
            <div className="gp-report" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              <span className="badge">{report.pagesKept} página(s)</span>
              <span className="badge">{report.sectionsKept} seção(ões)</span>
              <span className={`badge ${report.paletteValid ? 'badge-ok' : 'badge-warn'}`}>{report.paletteValid ? 'paleta válida' : 'paleta padrão'}</span>
              {report.sectionsDropped > 0 && <span className="badge badge-warn">{report.sectionsDropped} descartada(s)</span>}
              {report.reinforced && <span className="badge badge-warn">hero reforçado</span>}
            </div>
          )}

          {log.length > 0 && (
            <div className="gp-log" style={{ maxHeight: 160, overflow: 'auto', background: 'var(--bg-1, #0000000a)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: '.78rem', fontFamily: 'var(--mono, monospace)', lineHeight: 1.55 }}>
              {log.map((l, i) => <div key={i} className="muted">{l}</div>)}
            </div>
          )}

          {phase === 'error' && err && (
            <p style={{ color: 'var(--err)', fontSize: '.84rem', marginTop: 10, display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <Icon name="x" size={14} /> <span>{err}</span>
            </p>
          )}

          {phase === 'done' && (
            <p style={{ fontSize: '.86rem', marginTop: 10, display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <Icon name="check" size={14} />
              <span>
                {result?.published
                  ? <>Portal no ar em <a href={result?.url || `/sites/${slugify(effectiveKey)}`} target="_blank" rel="noopener noreferrer"><code>{result?.url || `/sites/${slugify(effectiveKey)}`}</code></a>.</>
                  : <>Portal criado como <strong>rascunho</strong> — aguardando aprovação do administrador para ir ao ar.</>}
              </span>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
