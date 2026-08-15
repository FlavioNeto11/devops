import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLabel, Loading, Banner, Markdown, FileViewer, formatBytes } from '../ui.jsx';
import { Icon } from '../icons.jsx';

export default function BibliotecaDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);
  const [related, setRelated] = useState([]);
  const label = useLabel();

  useEffect(() => {
    setItem(null); setError(null);
    api.libraryGet(id).then((it) => {
      setItem(it);
      api.library({ kind: it.kind }).then((list) => setRelated(list.filter((x) => x.id !== it.id).slice(0, 6))).catch(() => {});
    }).catch((e) => setError(e.message));
  }, [id]);

  return (
    <>
      <div className="crumbs"><Link to="/biblioteca">Biblioteca</Link> › {item ? item.title : '…'}</div>
      <Banner kind="err">{error}</Banner>
      {!item && !error && <Loading />}

      {item && (
        <div className="detail-aside-layout">
          <div className="detail-content">
            <div className="pgtitle"><h1>{item.title}</h1></div>
            <div className="chip-row" style={{ marginBottom: 14 }}>
              <span className="chip chip-accent">{label('library_kind', item.kind)}</span>
              {(item.tags || []).map((t) => <span key={t} className="chip">{t}</span>)}
            </div>

            {item.summary && <div className="card" style={{ marginBottom: 16 }}><div className="card-body"><Markdown text={item.summary} /></div></div>}
            {item.body && <div className="card" style={{ marginBottom: 16 }}><div className="card-body"><Markdown text={item.body} /></div></div>}

            {item.fileRef && item.fileRef.stored && (
              <div className="card">
                <div className="card-head"><h3>Documento</h3><div className="spacer" style={{ flex: 1 }} /><span className="small muted">{(item.fileRef.ext || '').replace('.', '').toUpperCase()} · {formatBytes(item.fileRef.sizeBytes)}</span></div>
                <div className="card-body">
                  <FileViewer url={api.libraryFileUrl(item.id)} mime={item.fileRef.mime} title={item.title} />
                </div>
              </div>
            )}
            {item.fileRef && !item.fileRef.stored && (
              <Banner kind="warn">O arquivo deste item ainda não foi carregado no portal.</Banner>
            )}
          </div>

          <aside>
            <div className="card">
              <div className="card-head"><h3>Relacionados</h3></div>
              <div className="card-body">
                {related.length === 0 && <p className="small muted">—</p>}
                {related.map((r) => (
                  <Link key={r.id} to={`/biblioteca/${r.id}`} style={{ display: 'block', padding: '7px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13 }}>{r.title}</Link>
                ))}
                <Link to="/jurisprudencia" className="btn sm ghost" style={{ marginTop: 12 }}><Icon name="gavel" size={13} /> Ver jurisprudência</Link>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
