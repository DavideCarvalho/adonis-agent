export interface ChunkOptions {
  /** Target max characters per chunk. Default 800. */
  chunkSize?: number;
  /** Characters of overlap carried from the end of one chunk into the next. Default 100. */
  overlap?: number;
  /**
   * The record delimiter, when the text has boundaries that *mean* something. Pass it and the chunker
   * cuts ONLY on this string — never inside a record.
   *
   * Prose has no real boundaries, so the default heuristic (paragraph → sentence → word, in the back
   * half of the window) is the right guess. Machine-shaped text is the opposite case: a spreadsheet
   * flattened to one field-labelled record per line, a log, a JSONL export. There the boundaries are
   * known exactly, and a heuristic cut lands mid-record — stranding the half that carries the row
   * identifier in a different chunk from the half that carries the value, so neither chunk can answer
   * a question about that row. `separator: '\n'` says "the lines are the records".
   *
   * Two consequences worth knowing before you pass it, both by design:
   *
   * 1. **`chunkSize` becomes a target, not a cap.** A single record longer than `chunkSize` is emitted
   *    whole, as its own over-size chunk. It is NOT split, and it does NOT fall back to the prose
   *    heuristic — a mid-record cut is the exact failure `separator` exists to prevent, so silently
   *    performing one to respect a size limit would defeat the feature. An over-size chunk is visible
   *    (you can see the record, and shorten it or raise `chunkSize`); a mangled record is not. It never
   *    drags its neighbours over the limit either: it always chunks alone.
   * 2. **`overlap` is spent on whole records.** It stops being a character count and becomes a
   *    character *budget*, filled with entire trailing records of the previous chunk — as many as fit,
   *    never a partial one, and never so many that a chunk fails to advance. Half a record is not
   *    useful context; it is the same mid-record cut by another name. `overlap: 0` carries nothing,
   *    which is usually what self-contained records want.
   *
   * Empty or whitespace-only records are dropped. An empty string is treated as "not passed" (it would
   * otherwise split every character), leaving the prose path. Omit it and NOTHING changes: the prose
   * path below is untouched, byte-for-byte, so no existing corpus is re-chunked (and so none has to be
   * re-embedded).
   */
  separator?: string;
}

/**
 * Splits text into overlapping chunks for embedding. Greedy up to `chunkSize`, but prefers to break on
 * a paragraph → sentence → word boundary in the back half of the window (so a chunk rarely cuts
 * mid-sentence), then carries `overlap` characters into the next chunk to preserve context across the
 * seam. Pure and deterministic.
 *
 * Pass {@link ChunkOptions.separator} for text whose record boundaries are known rather than guessed;
 * that path cuts only on the separator, and its two deviations (`chunkSize` becomes a target,
 * `overlap` is spent on whole records) are documented there.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? 800;
  const overlap = options.overlap ?? 100;
  const separator = options.separator;
  if (separator !== undefined && separator.length > 0) {
    return chunkRecords(text, separator, chunkSize, overlap);
  }
  const normalized = text.trim();
  if (normalized.length === 0) {
    return [];
  }
  if (normalized.length <= chunkSize) {
    return [normalized];
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    let breakAt = end;
    if (end < normalized.length) {
      const window = normalized.slice(start, end);
      const boundary = Math.max(
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('. '),
        window.lastIndexOf(' '),
      );
      // Only honour a boundary in the back half, else a tiny chunk cascades.
      if (boundary > chunkSize / 2) {
        breakAt = start + boundary + 1;
      }
    }
    const chunk = normalized.slice(start, breakAt).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    if (breakAt >= normalized.length) {
      break;
    }
    // Step forward with overlap, but always make progress (guards against a stuck boundary).
    start = Math.max(breakAt - overlap, start + 1);
  }
  return chunks;
}

/**
 * The {@link ChunkOptions.separator} path: pack WHOLE records into chunks. Records are the atoms here —
 * no chunk ever contains a fragment of one — so `chunkSize` is honoured by taking fewer records rather
 * than by cutting one, and `overlap` is honoured by repeating trailing records rather than by repeating
 * characters. Pure and deterministic; see {@link ChunkOptions.separator} for the two trades.
 */
function chunkRecords(
  text: string,
  separator: string,
  chunkSize: number,
  overlap: number,
): string[] {
  const records = text
    .split(separator)
    .map((record) => record.trim())
    .filter((record) => record.length > 0);
  if (records.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < records.length) {
    // Pack forward while the joined length fits. The FIRST record is taken unconditionally: that is
    // what emits an over-long record whole instead of cutting it (trade 1).
    let end = start;
    let length = 0;
    while (end < records.length) {
      const record = records[end] ?? '';
      const cost = end === start ? record.length : separator.length + record.length;
      if (end > start && length + cost > chunkSize) {
        break;
      }
      length += cost;
      end += 1;
    }
    chunks.push(records.slice(start, end).join(separator));
    if (end >= records.length) {
      break;
    }
    // Overlap as a whole-record budget: walk back over trailing records while they fit in `overlap`.
    // `back > start + 1` keeps at least one record consumed by this chunk, so `start` strictly
    // increases — an over-long record (which always chunks alone) is therefore never carried forward,
    // and no `overlap`, however large, can stall the loop.
    let back = end;
    let carried = 0;
    while (back > start + 1) {
      const cost = (records[back - 1] ?? '').length + separator.length;
      if (carried + cost > overlap) {
        break;
      }
      carried += cost;
      back -= 1;
    }
    start = back;
  }
  return chunks;
}
