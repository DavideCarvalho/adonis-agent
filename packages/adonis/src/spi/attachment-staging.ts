import type { Actor, MessageAttachment } from '../types.js';

/** Input to {@link AttachmentStagingStore.stage} — the raw bytes plus who uploaded them. */
export interface StageAttachmentInput {
  data: Buffer;
  filename: string;
  contentType: string;
  sizeBytes: number;
  actor: Actor;
}

/**
 * Optional upload-side seam for message attachments (an image/PDF a user attaches to a chat message
 * before the model ever sees it). The lib never fetches bytes itself — {@link MessageAttachment.url}
 * must already be reachable by the model provider — so something has to turn an uploaded file into
 * that URL first. A store adapter (or a thin wrapper over the host's own media pipeline) implements
 * this and is wired via `defineConfig({ attachmentStaging })` — pass an instance, a lazy
 * `attachmentStores.*()` factory, or omit it. When omitted the optional `POST /agent/attachments`
 * upload route is never mounted, so a client sends already-staged {@link MessageAttachment}s directly.
 */
export interface AttachmentStagingStore {
  /**
   * Persist an uploaded file somewhere the model can later fetch (a presigned URL, a proxy, or a
   * `data:` URI) and return the {@link MessageAttachment} to send with the next chat message. The lib
   * never fetches bytes; the returned url must be reachable by the model provider.
   */
  stage(input: StageAttachmentInput): Promise<MessageAttachment>;
}
