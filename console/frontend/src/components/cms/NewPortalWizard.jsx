import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';
import { useToast } from '../ToastProvider.jsx';
import { pmProjects, pmCreateProject, pmCmsCreatePage, pmCmsCreateSection, pmCmsGenerate } from '../../api.js';
import { isPortal } from '../../lib/appTypes.js';

/**
 * NewPortalWizard — criação de um portal CMS com identidade PRÓPRIA (key,
 * cms_site, páginas e publicação próprios). O vínculo com um produto/sistema
 * existente é OPCIONAL e relacional (contexto p/ IA, governança e relacionamento)
 * — nunca transforma o portal no produto nem reutiliza a key dele.
 * Governança: admin cria já aprovado; member cria como pendente de aprovação.
 */
const slugify = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pmProjects()
      .then((p) => setProducts((p || []).filter((x) => !isPortal(x))))
      .catch(() => setProducts([]));
  }, []);

  const effectiveKey = useMemo(() => (keyTouched ? key : slugify(name)), [key, keyTouched, name]);
  const keyClash = products.some((p) => p.key === effectiveKey);

  const submit = async () => {
    const k = slugify(effectiveKey);
    if (!name.trim() || !k) { toast.err('Informe o nome do portal.'); return; }
    setBusy(true);
    try {
      const project = await pmCreateProject({
        key: k,
        name: name.trim(),
        app_type: 'cms_portal',
        route: `/${k}`,
        stack: 'Portal CMS',
        related_project_id: linkMode === 'linked' && relatedId ? relatedId : null,
      });
      // Página inicial (rascunho): o conteúdo existe antes da publicação.
      const page = await pmCmsCreatePage(project.id, { slug: 'home', title: 'Home', status: 'draft' });
      for (const s of TEMPLATES[template]?.sections || []) {
        // eslint-disable-next-line no-await-in-loop
        await pmCmsCreateSection(page.id, { kind: s.kind, data: s.data, status: 'published', visible: true });
      }
      // Geração assistida (opcional): adiciona seções de RASCUNHO marcadas como
      // geradas por IA. Falha da IA não bloqueia a criação do portal.
      if (aiPrompt.trim()) {
        try {
          const g = await pmCmsGenerate(project.id, {
            prompt: aiPrompt.trim(),
            kind: 'portal',
            template,
            context: linkMode === 'linked' && relatedId ? { relatedProjectId: relatedId } : {},
          });
          toast.ok(`IA gerou ${g?.created?.sections ?? 0} seção(ões) em rascunho — revise no editor.`);
        } catch (e) {
          toast.err(`Portal criado, mas a geração por IA não rodou: ${e.message}`);
        }
      }
      toast.ok(project.approval_status === 'pending_approval'
        ? 'Portal criado como rascunho — aguardando aprovação do administrador para ir ao ar.'
        : 'Portal criado.');
      onCreated?.(project);
      onClose();
    } catch (e) { toast.err(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Novo portal (CMS)" size="md" onClose={onClose}
      footer={(
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy || !name.trim() || keyClash} onClick={submit}>
            {busy ? 'Criando…' : 'Criar portal'}
          </button>
        </>
      )}>
      <label className="field" style={{ marginBottom: 10 }}>
        <span className="field__label">Nome do portal</span>
        <input className="input" placeholder="ex.: Clínica Horizonte" value={name} autoFocus
          onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field" style={{ marginBottom: 10 }}>
        <span className="field__label">Chave (identidade própria — vira a rota /chave)</span>
        <input className="input" placeholder="ex.: clinica-horizonte" value={effectiveKey}
          onChange={(e) => { setKeyTouched(true); setKey(slugify(e.target.value)); }} />
        {keyClash && <span className="muted" style={{ color: 'var(--err, #c00)', fontSize: '.8rem' }}>Esta chave já pertence a um produto existente — escolha outra.</span>}
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
              O vínculo é apenas relacional — serve para contexto, IA, governança e relatórios
              (ex.: portal institucional que apresenta o produto). Ele <strong>não</strong> substitui o
              produto nem reutiliza a chave dele.
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
          As seções geradas entram como <strong>rascunho</strong> marcadas como “geradas por IA” — nada vai ao ar sem revisão.
          Requer IA configurada no servidor; sem ela, o portal é criado normalmente sem o rascunho.
        </span>
      </label>

      {!isAdmin && (
        <p className="muted" style={{ fontSize: '.82rem', display: 'flex', gap: 6, alignItems: 'center' }}>
          <Icon name="info" size={14} /> O portal será criado como <strong>pendente de aprovação</strong>:
          você já pode montar o conteúdo, mas ele só vai ao ar após o administrador aprovar.
        </p>
      )}
    </Modal>
  );
}
