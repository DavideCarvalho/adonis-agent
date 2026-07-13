/**
 * The `@adonis-agora/diagnostics` emit capability, published on this global slot at that package's
 * module load. `@adonis-agora/agent` reads it STRUCTURALLY — it never imports or depends on the
 * diagnostics package. When diagnostics isn't installed the slot is empty and emitting is an inert
 * no-op that never throws back into the agent loop.
 *
 * Events land on `agora:agent:<event>`; the payload shapes below are the contract every consumer
 * (dashboard / telescope) reads.
 */
const EMIT_SLOT = Symbol.for('@agora/diagnostics:emit');
type EmitFn = (lib: string, event: string, payload: unknown) => void;

/** Payloads carried on each `agora:agent:*` channel. */
export interface AgentRunStarted {
  runId: string;
  threadId: string;
  actorId: string;
  persona?: string;
}
export interface AgentMessageEvent {
  runId: string;
  threadId: string;
  role: 'user' | 'assistant';
  textLength: number;
}
export interface AgentToolCallEvent {
  runId: string;
  toolName: string;
  toolType: 'read' | 'action';
  status: string;
  durationMs?: number;
}
export interface AgentQuotaExceeded {
  actorId: string;
  usedTokens: number;
  limitTokens: number;
}
export interface AgentRunFinished {
  runId: string;
  threadId: string;
  steps: number;
  inputTokens: number;
  outputTokens: number;
}
export interface AgentDelegated {
  runId: string;
  fromAgent?: string;
  toAgent: string;
}
export interface AgentRetrieved {
  runId: string;
  /** Length of the query (not the text) — same redaction posture as {@link AgentMessageEvent}. */
  queryLength: number;
  count: number;
}

/** Maps each event name to its payload type, so {@link publishAgent} is checked at the call site. */
export interface AgentDiagnosticPayloads {
  'run.started': AgentRunStarted;
  message: AgentMessageEvent;
  'tool-call': AgentToolCallEvent;
  'quota.exceeded': AgentQuotaExceeded;
  'run.finished': AgentRunFinished;
  delegated: AgentDelegated;
  retrieved: AgentRetrieved;
}

export type AgentDiagnosticEvent = keyof AgentDiagnosticPayloads;

/**
 * Publish an agent event on `agora:agent:<event>` via the structural diagnostics slot. No-op when
 * diagnostics isn't installed (the slot is empty) — and it never throws back into the agent loop.
 */
export function publishAgent<E extends AgentDiagnosticEvent>(
  event: E,
  payload: AgentDiagnosticPayloads[E],
): void {
  const emit = (globalThis as Record<symbol, unknown>)[EMIT_SLOT] as EmitFn | undefined;
  if (typeof emit === 'function') {
    try {
      emit('agent', event, payload);
    } catch {
      // diagnostics must never break an agent run
    }
  }
}

export function publishAgentRunStarted(payload: AgentRunStarted): void {
  publishAgent('run.started', payload);
}
export function publishAgentMessage(payload: AgentMessageEvent): void {
  publishAgent('message', payload);
}
export function publishAgentToolCall(payload: AgentToolCallEvent): void {
  publishAgent('tool-call', payload);
}
export function publishAgentQuotaExceeded(payload: AgentQuotaExceeded): void {
  publishAgent('quota.exceeded', payload);
}
export function publishAgentRunFinished(payload: AgentRunFinished): void {
  publishAgent('run.finished', payload);
}
export function publishAgentDelegated(payload: AgentDelegated): void {
  publishAgent('delegated', payload);
}
export function publishAgentRetrieved(payload: AgentRetrieved): void {
  publishAgent('retrieved', payload);
}
