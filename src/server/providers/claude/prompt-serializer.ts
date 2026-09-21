import type {
  LanguageModelV3Message,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';

export function serializePrompt(prompt: LanguageModelV3Prompt): string {
  const chunks: string[] = [];

  for (const message of prompt) {
    if (message.role === 'system') {
      chunks.push('[System]');
      chunks.push(message.content);
      chunks.push('');
      continue;
    }

    if (message.role === 'user') {
      chunks.push('[User]');
      chunks.push(partsToText(message.content));
      chunks.push('');
      continue;
    }

    if (message.role === 'assistant') {
      chunks.push('[Assistant]');
      chunks.push(partsToText(message.content));
      chunks.push('');
      continue;
    }

    if (message.role === 'tool') {
      chunks.push('[Tool]');
      chunks.push(partsToText(message.content));
      chunks.push('');
    }
  }

  return chunks.join('\n').trim();
}

type NonSystemMessageContent = Exclude<LanguageModelV3Message, { role: 'system' }>['content'];

function partsToText(parts: NonSystemMessageContent): string {
  const lines: string[] = [];

  for (const part of parts) {
    if (part.type === 'text') {
      lines.push(String(part.text ?? ''));
      continue;
    }

    if (part.type === 'reasoning') {
      lines.push(`[reasoning] ${String(part.text ?? '')}`);
      continue;
    }

    if (part.type === 'tool-call') {
      lines.push(`[tool-call:${String(part.toolName ?? 'unknown')}] ${safeJson(part.input)}`);
      continue;
    }

    if (part.type === 'tool-result') {
      lines.push(`[tool-result:${String(part.toolName ?? 'unknown')}] ${safeJson(part.output)}`);
      continue;
    }

    if (part.type === 'tool-approval-response') {
      lines.push(`[tool-approval-response:${String(part.approvalId ?? 'unknown')}] ${safeJson(part)}`);
      continue;
    }

    if (part.type === 'file') {
      lines.push(`[file:${String(part.mediaType ?? 'application/octet-stream')}]`);
      continue;
    }

    lines.push(`[${(part as { type: string }).type}]`);
  }

  return lines.join('\n');
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}
