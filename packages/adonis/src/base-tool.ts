import type { AiToolOptions } from './ai-tool-ref.js';
import type { AiToolCtx, ToolHandler } from './spi/tool.js';

/**
 * Optional base class for the class-authoring form of a tool — the counterpart of durable's
 * `BaseWorkflow`. Declaring `static tool?: AiToolOptions` here means a subclass writes
 * `static tool = { name, kind, description, input, … }` and gets it type-checked by the inherited
 * static declaration — no `satisfies AiToolOptions` needed. Implement `execute(input, ctx)`; the
 * discovery scan reads the static `tool` off the subclass and registers it (the abstract base
 * carries no `static tool`, so it is never registered itself).
 *
 * `I` is the parsed (Zod) input; `O` is the return — both flow into `execute`'s signature, so the
 * compiler checks the body against what the tool promises.
 *
 * ```ts
 * export default class FilaDeAlocacao extends BaseTool<Input, Row[]> {
 *   static tool = {
 *     name: 'fila_de_alocacao',
 *     kind: 'read',
 *     description: '…',
 *     input: z.object({}),
 *     ability: 'agent.coordenador.fila.ler',
 *   }
 *   async execute(_input: Input, ctx: AiToolCtx): Promise<Row[]> { … }
 * }
 * ```
 */
export abstract class BaseTool<I = unknown, O = unknown> implements ToolHandler<I, O> {
  static tool?: AiToolOptions;
  abstract execute(input: I, ctx: AiToolCtx): Promise<O> | O;
}

/** A config de um tool nas bases kind-específicas: {@link AiToolOptions} sem o `kind` (o base o fixa). */
export type BaseToolOptions = Omit<AiToolOptions, 'kind'>;

/**
 * Bases kind-específicas — `ReadTool` fixa `kind: 'read'`, `ActionTool` fixa `kind: 'action'`. Como a
 * subclasse NÃO declara `kind`, o `static tool = { name, description, input, ability }` fica sem nenhum
 * campo de união e type-checa **truly bare** — sem `satisfies AiToolOptions` e sem a anotação
 * `: AiToolOptions` (que o `kind: 'read' | 'action'` do {@link BaseTool} exigiria, já que a estática
 * herdada não dá contextual-typing e o literal alargaria `kind` para `string`). A descoberta lê o
 * `kind` da estática do base. Continua tipando `execute` por `<I, O>`.
 *
 * ```ts
 * export default class FilaDeAlocacao extends ReadTool<Input, Row[]> {
 *   static tool = { name: 'fila_de_alocacao', description: '…', input: z.object({}), ability: '…' }
 *   async execute(_input: Input, ctx: AiToolCtx): Promise<Row[]> { … }
 * }
 * ```
 */
export abstract class ReadTool<I = unknown, O = unknown> implements ToolHandler<I, O> {
  static readonly kind = 'read';
  static tool?: BaseToolOptions;
  abstract execute(input: I, ctx: AiToolCtx): Promise<O> | O;
}

/** Base kind-específica para tools `action` (exigem aprovação humana). Ver {@link ReadTool}. */
export abstract class ActionTool<I = unknown, O = unknown> implements ToolHandler<I, O> {
  static readonly kind = 'action';
  static tool?: BaseToolOptions;
  abstract execute(input: I, ctx: AiToolCtx): Promise<O> | O;
}
