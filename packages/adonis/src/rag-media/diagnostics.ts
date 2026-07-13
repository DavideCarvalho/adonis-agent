/**
 * The `@adonis-agora/diagnostics` emit capability, published on this global slot at that package's
 * module load. This bridge reads it STRUCTURALLY — it never imports or depends on the diagnostics
 * package. When diagnostics isn't installed the slot is empty and emitting is an inert no-op that never
 * throws back into an ingestion. Events land on `agora:rag:media.*`; the payload shapes below are the
 * contract every observer (Telescope / dashboard) reads. Mirrors the agent core's `diagnostics.ts`.
 */
const EMIT_SLOT = Symbol.for('@agora/diagnostics:emit');
type EmitFn = (lib: string, event: string, payload: unknown) => void;

export type RagMediaSkipReason = 'unsupported-type' | 'too-large' | 'empty-text';

/** Emitted on `agora:rag:media.ingested` once a media file's chunks are embedded + upserted. */
export interface RagMediaIngestedPayload {
  mediaId: string;
  ownerType?: string;
  ownerId?: string;
  collection?: string;
  tenantRef?: string;
  chunks: number;
}
/** Emitted on `agora:rag:media.removed` when a media document's chunks are dropped from the store. */
export interface RagMediaRemovedPayload {
  mediaId: string;
}
/** Emitted on `agora:rag:media.skipped` when a file is not indexed (unsupported/too-large/empty). */
export interface RagMediaSkippedPayload {
  mediaId: string;
  contentType: string;
  reason: RagMediaSkipReason;
}
/** Emitted on `agora:rag:media.failed` when an ingestion throws (bytes fetch / embed / upsert). */
export interface RagMediaFailedPayload {
  mediaId: string;
  error: string;
}

/** Maps each event name to its payload type, so {@link publishRagMedia} is checked at the call site. */
export interface RagMediaDiagnosticPayloads {
  'media.ingested': RagMediaIngestedPayload;
  'media.removed': RagMediaRemovedPayload;
  'media.skipped': RagMediaSkippedPayload;
  'media.failed': RagMediaFailedPayload;
}

export type RagMediaDiagnosticEvent = keyof RagMediaDiagnosticPayloads;

/**
 * Publish a rag-media event on `agora:rag:<event>` via the structural diagnostics slot. No-op when
 * diagnostics isn't installed (the slot is empty) — and it never throws back into an ingestion.
 */
export function publishRagMedia<E extends RagMediaDiagnosticEvent>(
  event: E,
  payload: RagMediaDiagnosticPayloads[E],
): void {
  const emit = (globalThis as Record<symbol, unknown>)[EMIT_SLOT] as EmitFn | undefined;
  if (typeof emit === 'function') {
    try {
      emit('rag', event, payload);
    } catch {
      // diagnostics must never break an ingestion
    }
  }
}

export function publishRagMediaIngested(payload: RagMediaIngestedPayload): void {
  publishRagMedia('media.ingested', payload);
}
export function publishRagMediaRemoved(payload: RagMediaRemovedPayload): void {
  publishRagMedia('media.removed', payload);
}
export function publishRagMediaSkipped(payload: RagMediaSkippedPayload): void {
  publishRagMedia('media.skipped', payload);
}
export function publishRagMediaFailed(payload: RagMediaFailedPayload): void {
  publishRagMedia('media.failed', payload);
}
