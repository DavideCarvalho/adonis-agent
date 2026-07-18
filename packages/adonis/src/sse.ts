import type { StreamFrame } from './spi/token-stream-sink.js';

/**
 * Serializa um {@link StreamFrame} pro envelope SSE do provider. Texto vira o
 * frame `data: {"delta":...}` (byte-idêntico ao envelope legado só-texto);
 * componente vira `event: component\ndata: {name,data}`.
 */
export function frameToSse(frame: StreamFrame): string {
  if (frame.t === 'component') {
    return `event: component\ndata: ${JSON.stringify({ name: frame.name, data: frame.data })}\n\n`;
  }
  return `data: ${JSON.stringify({ delta: frame.v })}\n\n`;
}
