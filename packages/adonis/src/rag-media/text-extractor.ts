/**
 * Turns a media file's raw bytes into the plain text that gets chunked, embedded, and indexed. The
 * extraction seam — so the RAG stack itself stays format-agnostic. Ships the text-family extractors;
 * bring your own for PDF/DOCX/etc. by registering a parser on a {@link MimeTextExtractor} (so no PDF
 * library is ever a hard dependency of `@adonis-agora/agent`). Mirrors the reference `rag-media`
 * `TextExtractor` contract exactly.
 */
export interface TextExtractor {
  extract(bytes: Buffer, contentType: string): Promise<string>;
}

/** Thrown when no extractor is registered for a content type — ingestion treats it as "skip, don't index". */
export class UnsupportedContentTypeError extends Error {
  constructor(readonly contentType: string) {
    super(`No text extractor registered for content type "${contentType}"`);
    this.name = 'UnsupportedContentTypeError';
  }
}

/** How a single content type (or `type/*` family) turns bytes into text. */
export type ExtractFn = (bytes: Buffer, contentType: string) => string | Promise<string>;

/**
 * A {@link TextExtractor} that dispatches by content type. Register exact types (`application/json`) or
 * a whole family (`text/*`); an exact match always wins over a family. Unregistered types throw
 * {@link UnsupportedContentTypeError}. This is the extension point for binary formats:
 * `.register('application/pdf', pdfFn)` — the PDF/DOCX library stays entirely on the host side.
 */
export class MimeTextExtractor implements TextExtractor {
  private readonly exact = new Map<string, ExtractFn>();
  private readonly families: { prefix: string; fn: ExtractFn }[] = [];

  register(contentType: string, fn: ExtractFn): this {
    if (contentType.endsWith('/*')) {
      // "text/*" → match anything starting "text/"
      this.families.push({ prefix: contentType.slice(0, -1), fn });
    } else {
      this.exact.set(contentType.toLowerCase(), fn);
    }
    return this;
  }

  async extract(bytes: Buffer, contentType: string): Promise<string> {
    const normalized = normalizeContentType(contentType);
    const fn = this.resolve(normalized);
    if (fn === undefined) {
      throw new UnsupportedContentTypeError(contentType);
    }
    return fn(bytes, normalized);
  }

  /** Whether a content type would resolve to an extractor (without reading bytes). */
  supports(contentType: string): boolean {
    return this.resolve(normalizeContentType(contentType)) !== undefined;
  }

  private resolve(contentType: string): ExtractFn | undefined {
    const exact = this.exact.get(contentType);
    if (exact !== undefined) {
      return exact;
    }
    for (const family of this.families) {
      if (contentType.startsWith(family.prefix)) {
        return family.fn;
      }
    }
    return undefined;
  }
}

/** Strip any `; charset=…` parameter off a content type and lower-case it. */
export function normalizeContentType(contentType: string): string {
  return (contentType.split(';')[0] ?? contentType).trim().toLowerCase();
}

/** Decode bytes as UTF-8 — the extractor for `text/*` and JSON. */
export function decodeUtf8(bytes: Buffer): string {
  return bytes.toString('utf8');
}

/** Decode UTF-8 then strip HTML: drop `<script>`/`<style>` bodies and tags, decode common entities. */
export function extractHtmlText(bytes: Buffer): string {
  return bytes
    .toString('utf8')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The default extractor: `text/plain`, `text/csv`, `text/markdown` (and the whole `text/*` family) plus
 * `application/json` decode as UTF-8, `text/html` is tag-stripped, and everything else — PDF, DOCX,
 * images — throws {@link UnsupportedContentTypeError} (so binary formats are skipped rather than indexed
 * as garbage). Extend it for those: `.register('application/pdf', myPdfExtractor)`.
 */
export function defaultTextExtractor(): MimeTextExtractor {
  return new MimeTextExtractor()
    .register('text/html', extractHtmlText)
    .register('text/plain', decodeUtf8)
    .register('text/csv', decodeUtf8)
    .register('text/markdown', decodeUtf8)
    .register('text/*', decodeUtf8)
    .register('application/json', decodeUtf8);
}
