/**
 * Client-side counterpart to {@link import('../sse.js').frameToSse}: parses the provider's SSE
 * envelope back into typed frames the browser can render. Kept framework-agnostic (no React, no
 * Adonis) so any consumer — a React hook, a Vue composable, a plain fetch loop — decodes the wire
 * format the same way, and so the envelope stays owned by the package that emits it.
 *
 * Wire format (see `frameToSse` + the provider's `#pipe`):
 * - `event: meta\ndata: {runId,threadId}`   — sent once, first, before any token
 * - `data: {"delta":"..."}`                  — a text chunk (default event, no `event:` line)
 * - `event: component\ndata: {name,data}`    — a rendered component
 * - `event: done\ndata: {}`                  — the run's stream finished
 */

/** A rendered part of an assistant message: streamed text, or a named component with its props. */
export type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'component'; name: string; data: unknown };

/** A decoded stream frame — the typed form of one SSE event. */
export type ChatFrame =
  | { type: 'text'; delta: string }
  | { type: 'component'; name: string; data: unknown }
  | { type: 'meta'; runId?: string; threadId?: string }
  | { type: 'done' };

/** One raw SSE event: the `event:` name (default `message`) and the joined `data:` payload. */
export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Parses one raw SSE frame (the text between `\n\n` separators, without them) into `{event, data}`.
 * A frame with no `data:` line (e.g. a `:` keep-alive comment) returns `null`.
 */
export function parseSseEvent(frame: string): SseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  return { event, data: dataLines.join('\n') };
}

/**
 * Decodes a parsed {@link SseEvent} into a typed {@link ChatFrame}, or `null` when the payload is
 * malformed (non-JSON, or missing required fields) so callers can skip it without crashing.
 */
export function decodeFrame(event: SseEvent): ChatFrame | null {
  if (event.event === 'done') {
    return { type: 'done' };
  }
  if (event.event === 'meta') {
    try {
      const parsed = JSON.parse(event.data) as { runId?: unknown; threadId?: unknown };
      return {
        type: 'meta',
        ...(typeof parsed?.runId === 'string' ? { runId: parsed.runId } : {}),
        ...(typeof parsed?.threadId === 'string' ? { threadId: parsed.threadId } : {}),
      };
    } catch {
      return null;
    }
  }
  if (event.event === 'component') {
    try {
      const parsed = JSON.parse(event.data) as { name?: unknown; data?: unknown };
      if (typeof parsed?.name !== 'string') {
        return null;
      }
      return { type: 'component', name: parsed.name, data: parsed.data };
    } catch {
      return null;
    }
  }
  // Default event: a text delta.
  try {
    const parsed = JSON.parse(event.data) as { delta?: unknown } | null;
    const delta = parsed?.delta;
    if (typeof delta !== 'string' || delta.length === 0) {
      return null;
    }
    return { type: 'text', delta };
  } catch {
    return null;
  }
}

/**
 * Folds a renderable {@link ChatFrame} (text or component) into the message's parts, concatenating
 * consecutive text deltas into the trailing text part and appending components in order. `meta`/`done`
 * frames are control frames and are ignored here. Returns a new array (never mutates the input).
 */
export function foldPart(parts: ChatPart[], frame: ChatFrame): ChatPart[] {
  if (frame.type === 'component') {
    return [...parts, { type: 'component', name: frame.name, data: frame.data }];
  }
  if (frame.type === 'text') {
    const last = parts[parts.length - 1];
    if (last && last.type === 'text') {
      return [...parts.slice(0, -1), { type: 'text', text: last.text + frame.delta }];
    }
    return [...parts, { type: 'text', text: frame.delta }];
  }
  return parts;
}

/**
 * Reads a byte {@link ReadableStream} (a `fetch` `response.body`) as a sequence of raw SSE events,
 * splitting on the `\n\n` frame separator and buffering partial frames across chunks. Yields only
 * frames that carry a `data:` payload (keep-alives are dropped).
 */
export async function* readSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const frame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsed = parseSseEvent(frame);
        if (parsed) {
          yield parsed;
        }
        separatorIndex = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}
