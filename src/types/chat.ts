export interface ToolPart {
  type: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolName?: string;
}

export function isToolPartType(type: string): boolean {
  return type.startsWith('tool-') || type === 'dynamic-tool';
}

export function asToolPart(part: { type: string; [key: string]: unknown }): ToolPart {
  return {
    type: part.type,
    toolCallId: (part.toolCallId ?? undefined) as string | undefined,
    state: (part.state ?? undefined) as string | undefined,
    input: part.input,
    output: part.output,
    errorText: (part.errorText ?? undefined) as string | undefined,
    toolName: (part.toolName ?? part.type.replace('tool-', '')) as string,
  };
}
