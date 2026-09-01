/**
 * Split a document into chunks for embedding. Paragraph-first, then sentence-splitting
 * any paragraph over the size budget. Deterministic — the same document always chunks
 * the same way, which the re-embed jobs rely on.
 */
export function chunk(text: string, maxChars = 500): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  for (const para of paras) {
    if (para.length <= maxChars) {
      chunks.push(para);
      continue;
    }
    let buf = "";
    for (const sentence of para.split(/(?<=[.!?])\s+/)) {
      const candidate = buf ? `${buf} ${sentence}` : sentence;
      if (candidate.length > maxChars && buf) {
        chunks.push(buf.trim());
        buf = sentence;
      } else {
        buf = candidate;
      }
    }
    if (buf.trim().length > 0) chunks.push(buf.trim());
  }
  return chunks;
}
