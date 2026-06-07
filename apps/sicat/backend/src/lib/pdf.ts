function escapePdfText(value: unknown): string {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function buildSimplePdf(lines: string[] = []): Buffer {
  const safeLines = lines.filter(Boolean).map((line) => escapePdfText(line));
  let content = 'BT\n/F1 12 Tf\n50 780 Td\n14 TL\n';

  for (const [index, line] of safeLines.entries()) {
    if (index === 0) {
      content += `(${line}) Tj\n`;
    } else {
      content += `T* (${line}) Tj\n`;
    }
  }

  content += 'ET';

  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n');
  objects.push(`4 0 obj\n<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream\nendobj\n`);
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  let offset = Buffer.byteLength('%PDF-1.4\n', 'utf8');
  const offsets = [0];
  let body = '%PDF-1.4\n';

  for (const obj of objects) {
    offsets.push(offset);
    body += obj;
    offset = Buffer.byteLength(body, 'utf8');
  }

  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets.slice(1)) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }

  const trailerOffset = Buffer.byteLength(body + xref, 'utf8');
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${trailerOffset}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, 'utf8');
}
