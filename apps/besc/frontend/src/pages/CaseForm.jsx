import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Field, EnumSelect, Banner, Loading } from '../ui.jsx';

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
        <fieldset>
          <legend>Titular</legend>
          <div className="form-grid">
            <Field label="Nome do titular"><input value={form.holder_name} onChange={set('holder_name')} placeholder="Nome completo / razão social" /></Field>
            <Field label="CPF / CNPJ"><input value={form.holder_tax_id} onChange={set('holder_tax_id')} placeholder="000.000.000-00" /></Field>
            <Field label="Tipo de titular"><EnumSelect enumName="holder_type" value={form.holder_type} onChange={setEnum('holder_type')} /></Field>
            <Field label="Contato" hint="Telefone, e-mail ou responsável"><input value={form.contact} onChange={set('contact')} /></Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>Ações / direitos</legend>
          <div className="form-grid">
            <Field label="Origem das ações/direitos"><input value={form.origin} onChange={set('origin')} placeholder="Herança, aquisição, cessão…" /></Field>
            <Field label="Data aproximada de aquisição"><input value={form.acquisition_date} onChange={set('acquisition_date')} placeholder="Ex.: 2001 ou 03/2005" /></Field>
            <Field label="Quantidade de ações"><input value={form.share_quantity} onChange={set('share_quantity')} inputMode="numeric" /></Field>
            <Field label="Classe das ações"><EnumSelect enumName="share_class" value={form.share_class} onChange={setEnum('share_class')} /></Field>
            <Field label="Nº de certificados (se houver)"><input value={form.certificate_count} onChange={set('certificate_count')} /></Field>
            <Field label="Banco / escriturador envolvido"><input value={form.registrar} onChange={set('registrar')} placeholder="Ex.: Banco do Brasil / escriturador" /></Field>
            <Field label="Tipo de direito"><EnumSelect enumName="right_type" value={form.right_type} onChange={setEnum('right_type')} /></Field>
            <Field label="Situação de liquidez"><EnumSelect enumName="liquidity_status" value={form.liquidity_status} onChange={setEnum('liquidity_status')} /></Field>
            <Field label="Valor estimado (R$)" hint="Estimativa informada; o sistema não apura valor oficial"><input value={form.estimated_value} onChange={set('estimated_value')} placeholder="Ex.: 150000" /></Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>Descrição</legend>
          <Field label="Resumo do caso"><textarea value={form.summary} onChange={set('summary')} rows={3} /></Field>
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
