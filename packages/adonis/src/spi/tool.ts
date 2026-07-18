import type { Actor, PageContext, Persona } from '../types.js';

/**
 * Per-invocation context handed to a tool handler. Host-supplied bits are optional. Identity lives
 * on {@link AiToolCtx.actor} — read `ctx.actor.id` / `ctx.actor.tenantRef` (single source of truth;
 * no denormalized copies).
 */
export interface AiToolCtx {
  actor: Actor;
  threadId: string;
  runId: string;
  requestId: string;
  persona?: Persona;
  pageContext?: PageContext;
  /** Optional host handle (e.g. an ORM EntityManager) the app threads through options. */
  host?: unknown;
  /**
   * Empurra um componente de UI pro stream do run, na posição atual (entre os
   * tokens de texto já emitidos e os próximos). Opcional: só a montagem no
   * agent-loop provê; outros construtores de ctx podem omitir.
   */
  emitComponent?(name: string, data: unknown): void | Promise<void>;
}

/**
 * A tool implementation. `I` is the parsed (Zod-validated) input; `O` is what `execute` returns
 * (serialized back to the model). `O` defaults to `unknown` — so `ToolHandler<I>` keeps working —
 * but typing it lets the compiler check the return against what the tool promises.
 */
export interface ToolHandler<I = unknown, O = unknown> {
  execute(input: I, ctx: AiToolCtx): Promise<O> | O;
}
