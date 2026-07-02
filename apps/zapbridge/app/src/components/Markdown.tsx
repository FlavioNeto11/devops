import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, radius, Palette } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

// Renderizador de Markdown leve para o assistente (sem dependência externa; seguro p/ web+nativo).
// Cobre o que o LLM produz: **negrito**, *itálico*, `código`, títulos (#), listas (- / 1.),
// tabelas (| a | b |) e parágrafos. Parsing linear (sem ReDoS).

type Inline = { t: string; bold?: boolean; italic?: boolean; code?: boolean };

function tokenizeInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) parts.push({ t: tok.slice(2, -2), bold: true });
    else if (tok.startsWith('`')) parts.push({ t: tok.slice(1, -1), code: true });
    else parts.push({ t: tok.slice(1, -1), italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ t: text.slice(last) });
  return parts.length ? parts : [{ t: text }];
}

function Inline({ text, base, colors }: { text: string; base: object; colors: Palette }) {
  return (
    <Text style={base}>
      {tokenizeInline(text).map((p, i) => (
        <Text
          key={i}
          style={[
            p.bold && { fontWeight: '700' as const, color: colors.text },
            p.italic && { fontStyle: 'italic' as const },
            p.code && {
              fontFamily: 'monospace',
              backgroundColor: colors.surfaceAlt,
              color: colors.link,
            },
          ]}
        >
          {p.t}
        </Text>
      ))}
    </Text>
  );
}

const cells = (row: string): string[] =>
  row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

export function Markdown({ text, color }: { text: string; color?: string }) {
  const colors = useTheme();
  const styles = makeStyles(colors);
  const baseStyle = { color: color ?? colors.text, fontSize: 14.5, lineHeight: 21 };

  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Tabela: linha com | e a seguinte é separadora (|---|---|)
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*$/.test(lines[i + 1]!)) {
      const header = cells(line);
      i += 2; // pula header + separador
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) {
        rows.push(cells(lines[i]!));
        i++;
      }
      out.push(
        <View key={key++} style={styles.table}>
          <View style={[styles.tr, styles.trHead]}>
            {header.map((h, ci) => (
              <View key={ci} style={styles.td}>
                <Inline text={h} base={[baseStyle, styles.thText]} colors={colors} />
              </View>
            ))}
          </View>
          {rows.map((r, ri) => (
            <View key={ri} style={[styles.tr, ri % 2 === 1 && styles.trAlt]}>
              {r.map((c, ci) => (
                <View key={ci} style={styles.td}>
                  <Inline text={c} base={baseStyle} colors={colors} />
                </View>
              ))}
            </View>
          ))}
        </View>,
      );
      continue;
    }

    // Título
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const sizes = [19, 17, 15.5];
      out.push(
        <Inline
          key={key++}
          text={h[2]!}
          base={[baseStyle, { fontSize: sizes[h[1]!.length - 1], fontWeight: '700' as const, marginTop: spacing.sm, marginBottom: 2 }]}
          colors={colors}
        />,
      );
      i++;
      continue;
    }

    // Lista com marcador
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      out.push(
        <View key={key++} style={{ marginVertical: 2 }}>
          {items.map((it, ii) => (
            <View key={ii} style={styles.li}>
              <Text style={[baseStyle, { color: colors.primary }]}>•  </Text>
              <Inline text={it} base={[baseStyle, { flex: 1 }]} colors={colors} />
            </View>
          ))}
        </View>,
      );
      continue;
    }

    // Lista numerada
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      let n = 1;
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push(
        <View key={key++} style={{ marginVertical: 2 }}>
          {items.map((it, ii) => (
            <View key={ii} style={styles.li}>
              <Text style={[baseStyle, { color: colors.primary, fontWeight: '700' }]}>{n++}.  </Text>
              <Inline text={it} base={[baseStyle, { flex: 1 }]} colors={colors} />
            </View>
          ))}
        </View>,
      );
      continue;
    }

    // Divisória
    if (/^\s*---+\s*$/.test(line)) {
      out.push(<View key={key++} style={styles.hr} />);
      i++;
      continue;
    }

    // Linha em branco
    if (!line.trim()) {
      i++;
      continue;
    }

    // Parágrafo (junta linhas até quebra/bloco)
    const para = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^\s*[-*]\s+/.test(lines[i]!) &&
      !/^\s*\d+\.\s+/.test(lines[i]!) &&
      !/^#{1,3}\s+/.test(lines[i]!) &&
      !/^\s*\|/.test(lines[i]!) &&
      !/^\s*---+\s*$/.test(lines[i]!)
    ) {
      para.push(lines[i]!);
      i++;
    }
    out.push(<Inline key={key++} text={para.join('\n')} base={[baseStyle, { marginBottom: spacing.xs }]} colors={colors} />);
  }

  return <View>{out}</View>;
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    li: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
    hr: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
    table: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden', marginVertical: spacing.sm },
    tr: { flexDirection: 'row' },
    trHead: { backgroundColor: colors.surfaceAlt },
    trAlt: { backgroundColor: colors.surfaceAlt },
    td: { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    thText: { fontWeight: '700' as const, color: colors.primary, fontSize: 13 },
  });
