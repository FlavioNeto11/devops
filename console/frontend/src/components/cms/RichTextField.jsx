import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

/**
 * Editor WYSIWYG (TipTap) para campos HTML. Emite HTML via onChange.
 * Mantem sincronia quando o `value` muda por fora (troca de secao).
 */
export default function RichTextField({ value, onChange }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    editorProps: { attributes: { style: 'min-height:120px;outline:none;', class: 'rt-pm' } },
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  useEffect(() => {
    if (editor && (value || '') !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  if (!editor) return null;

  const Btn = ({ active, on, title, children }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => { e.preventDefault(); on(); }}
      style={{
        border: '1px solid var(--line2)', background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text)', borderRadius: 6, padding: '3px 8px',
        fontSize: '.8rem', cursor: 'pointer', fontWeight: 600,
      }}
    >
      {children}
    </button>
  );

  const c = () => editor.chain().focus();
  return (
    <div style={{ border: '1px solid var(--line2)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: 6, borderBottom: '1px solid var(--line)' }}>
        <Btn title="Negrito" active={editor.isActive('bold')} on={() => c().toggleBold().run()}><b>B</b></Btn>
        <Btn title="Itálico" active={editor.isActive('italic')} on={() => c().toggleItalic().run()}><i>I</i></Btn>
        <Btn title="Título grande" active={editor.isActive('heading', { level: 2 })} on={() => c().toggleHeading({ level: 2 }).run()}>H2</Btn>
        <Btn title="Título médio" active={editor.isActive('heading', { level: 3 })} on={() => c().toggleHeading({ level: 3 }).run()}>H3</Btn>
        <Btn title="Lista com marcadores" active={editor.isActive('bulletList')} on={() => c().toggleBulletList().run()}>• Marcadores</Btn>
        <Btn title="Lista numerada" active={editor.isActive('orderedList')} on={() => c().toggleOrderedList().run()}>1. Numerada</Btn>
        <Btn title="Desfazer" active={false} on={() => c().undo().run()}>↶</Btn>
        <Btn title="Refazer" active={false} on={() => c().redo().run()}>↷</Btn>
      </div>
      <div style={{ padding: '8px 10px' }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
