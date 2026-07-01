import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Field, EnumSelect, Banner, Loading, HelpCallout } from '../ui.jsx';

const EMPTY = {
  holder_name: '', holder_tax_id: '', contact: '', holder_type: 'pessoa_fisica',
  summary: '', origin: '', acquisition_date: '', share_quantity: '', share_class: 'unknown',
  certificate_count: '', registrar: '', right_type: 'indeterminado', liquidity_status: 'indeterminado',
  estimated_value: '', notes: '',
};

export default function CaseForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!editing) return;
    api.get(id).then((c) => {
      const next = { ...EMPTY };
      Object.keys(EMPTY).forEach((k) => { if (c[k] !== undefined && c[k] !== null) next[k] = c[k]; });
      setForm(next);
      setLoading(false);
    }).catch((e) => { setError(e.message); setLoading(false); });
  }, [id, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target ? e.target.value : e }));
  const setEnum = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      if (editing) { await api.update(id, form); navigate(`/cases/${id}`); }
      else { const c = await api.create(form); navigate(`/cases/${c.id}`); }
    } catch (err) { setError(err.message); setSaving(false); }
  }

  if (loading) return <Loading />;

  return (
    <>
      <div className="crumbs"><Link to="/">Casos</Link> / {editing ? 'Editar caso' : 'Novo caso'}</div>
      <div className="pgtitle"><h1>{editing ? 'Editar caso' : 'Cadastro do caso'}</h1></div>
      <Banner kind="err">{error}</Banner>

      <form onSubmit={submit} className="card"><div className="card-body">
        {!editing && (
          <HelpCallout title="Como preencher">
            Registre o que souber — nada precisa estar completo agora. O que faltar vira <strong>pendência</strong>
            depois. Passe o mouse no <span className="pill">?</span> ao lado de cada campo para ver um exemplo.{' '}
            <Link to="/ajuda">Ver o guia completo</Link>.
          </HelpCallout>
        )}
        <fieldset>
          <legend>Titular</legend>
          <div className="form-grid">
            <Field label="Nome do titular" help="Quem é o dono das ações/direitos." example="“João da Silva” ou “Espólio de João da Silva”.">
              <input value={form.holder_name} onChange={set('holder_name')} placeholder="Nome completo / razão social" />
            </Field>
            <Field label="CPF / CNPJ" example="123.456.789-00 (pessoa) ou 12.345.678/0001-90 (empresa).">
              <input value={form.holder_tax_id} onChange={set('holder_tax_id')} placeholder="000.000.000-00" />
            </Field>
            <Field label="Tipo de titular" help="Escolha conforme quem detém o direito hoje." example="Titular faleceu e há inventário → “Espólio” ou “Herdeiro”. Comprou o direito de alguém → “Cessionário”.">
              <EnumSelect enumName="holder_type" value={form.holder_type} onChange={setEnum('holder_type')} />
            </Field>
            <Field label="Contato" hint="Telefone, e-mail ou responsável" example="maria@email.com · (48) 99999-0000">
              <input value={form.contact} onChange={set('contact')} />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>Ações / direitos</legend>
          <div className="form-grid">
            <Field label="Origem das ações/direitos" help="De onde vieram as ações/direitos." example="“Herança do meu pai”, “compra em 1998”, “cessão de terceiro”.">
              <input value={form.origin} onChange={set('origin')} placeholder="Herança, aquisição, cessão…" />
            </Field>
            <Field label="Data aproximada de aquisição" help="Pode ser aproximada." example="“1995”, “03/2001”.">
              <input value={form.acquisition_date} onChange={set('acquisition_date')} placeholder="Ex.: 2001 ou 03/2005" />
            </Field>
            <Field label="Quantidade de ações" example="1250">
              <input value={form.share_quantity} onChange={set('share_quantity')} inputMode="numeric" />
            </Field>
            <Field label="Classe das ações" help="Está no certificado/extrato. ON = ordinária (com voto); PNA/PNB = preferenciais. Não sabe? deixe “Desconhecida”." example="O certificado diz “PNB” → escolha PNB.">
              <EnumSelect enumName="share_class" value={form.share_class} onChange={setEnum('share_class')} />
            </Field>
            <Field label="Nº de certificados (se houver)" example="CERT-000123">
              <input value={form.certificate_count} onChange={set('certificate_count')} />
            </Field>
            <Field label="Banco / escriturador envolvido" help="Instituição que registra/guarda as ações." example="Banco do Brasil (incorporou o BESC) / escriturador das ações.">
              <input value={form.registrar} onChange={set('registrar')} placeholder="Ex.: Banco do Brasil / escriturador" />
            </Field>
            <Field label="Tipo de direito" help="Acionário remanescente = ainda detém ações. Creditório = crédito/indenização a receber. Litigioso = crédito discutido num processo." example="Ação judicial pedindo diferença de ações → “Direito litigioso”.">
              <EnumSelect enumName="right_type" value={form.right_type} onChange={setEnum('right_type')} />
            </Field>
            <Field label="Situação de liquidez" help="Quão fácil é converter em dinheiro hoje." example="Crédito discutido em juízo → “Litigioso” (baixa liquidez).">
              <EnumSelect enumName="liquidity_status" value={form.liquidity_status} onChange={setEnum('liquidity_status')} />
            </Field>
            <Field label="Valor estimado (R$)" hint="Estimativa; o sistema não apura valor oficial" example="150000">
              <input value={form.estimated_value} onChange={set('estimated_value')} placeholder="Ex.: 150000" />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>Descrição</legend>
          <Field label="Resumo do caso" help="Conte a história em poucas linhas." example="“Herdeiros de titular de 1.200 ações ON do BESC; ação judicial discute a relação de troca na incorporação pelo BB.”">
            <textarea value={form.summary} onChange={set('summary')} rows={3} />
          </Field>
          <Field label="Observações gerais"><textarea value={form.notes} onChange={set('notes')} rows={2} /></Field>
        </fieldset>

        <div className="row">
          <button className="btn primary" disabled={saving} type="submit">{saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar caso'}</button>
          <Link className="btn" to={editing ? `/cases/${id}` : '/'}>Cancelar</Link>
        </div>
      </div></form>
    </>
  );
}
