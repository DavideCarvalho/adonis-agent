/**
 * The `@adonis-agora/media` diagnostics contract this bridge reads, re-declared here so the
 * integration couples to the *wire contract* (the `agora:media:*` channel) rather than importing the
 * media package — `@adonis-agora/media` stays an OPTIONAL, structurally-typed peer. Keep these mirrors
 * in sync with that library's core `diagnostics.ts` (`UploadCompletePayload`).
 */

/** The channel a media library publishes `upload.complete` on: `agora:media:upload.complete`. */
export const UPLOAD_COMPLETE_CHANNEL = 'agora:media:upload.complete';

/**
 * Emitted on `agora:media:upload.complete` when a stored upload finishes. It carries only the media
 * record `id`, the storage `disk`, and the object `key` — NOT the owner/collection/content-type — so
 * auto-ingesting it needs a `resolve` seam back to the media record (see
 * {@link import('./media-rag-ingestion.js').MediaRagIngestionConfig.resolve}).
 */
export interface UploadCompletePayload {
  id: string;
  disk: string;
  key: string;
}

/** The `@adonis-agora/diagnostics` envelope shape — the bridge only reads `payload`. */
interface DiagnosticEnvelope {
  payload: unknown;
}

/** Pull `.payload` off a diagnostics-channel message without an unguarded cast. */
export function envelopePayload(message: unknown): unknown {
  if (typeof message === 'object' && message !== null && 'payload' in message) {
    return (message as DiagnosticEnvelope).payload;
  }
  return undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isUploadCompleteEvent(payload: unknown): payload is UploadCompletePayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.id) &&
    isNonEmptyString(candidate.disk) &&
    isNonEmptyString(candidate.key)
  );
}
