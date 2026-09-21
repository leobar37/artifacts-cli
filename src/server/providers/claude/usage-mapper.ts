import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
  LanguageModelV3FinishReason,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';

export function mapFinishReason(reason: string | undefined): LanguageModelV3FinishReason {
  const raw = reason;

  if (!reason || reason === 'end_turn' || reason === 'stop_sequence') {
    return { unified: 'stop', raw };
  }

  if (reason === 'max_tokens') {
    return { unified: 'length', raw };
  }

  if (reason === 'tool_use') {
    return { unified: 'tool-calls', raw };
  }

  return { unified: 'other', raw };
}

export function mapUsage(msg: Extract<SDKMessage, { type: 'result' }>): LanguageModelV3Usage {
  const usage = msg.usage;

  return {
    inputTokens: {
      total: usage.input_tokens,
      noCache: usage.input_tokens,
      cacheRead: usage.cache_read_input_tokens,
      cacheWrite: usage.cache_creation_input_tokens,
    },
    outputTokens: {
      total: usage.output_tokens,
      text: usage.output_tokens,
      reasoning: undefined,
    },
    raw: {
      stop_reason: msg.stop_reason ?? undefined,
      total_cost_usd: msg.total_cost_usd,
    },
  };
}

export function emptyUsage(): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: undefined,
      text: undefined,
      reasoning: undefined,
    },
  };
}

export function getSessionId(msg: SDKMessage): string | undefined {
  if ('session_id' in msg && typeof msg.session_id === 'string') {
    return msg.session_id;
  }
  return undefined;
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
