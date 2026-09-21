import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
} from '@ai-sdk/provider';
import type { CreateClaudeModelOptions } from './types.js';
import { PROVIDER_ID } from './types.js';
import { resolveConfig, buildQueryOptions } from './config-resolver.js';
import { serializePrompt } from './prompt-serializer.js';
import { mapUsage, mapFinishReason, emptyUsage, getSessionId, formatErrorMessage } from './usage-mapper.js';

export async function doGenerate(
  options: CreateClaudeModelOptions,
  callOptions: LanguageModelV3CallOptions,
): Promise<LanguageModelV3GenerateResult> {
  const cfg = resolveConfig(options, callOptions);
  const prompt = serializePrompt(callOptions.prompt);

  let textOutput = '';
  let usage = emptyUsage();
  let rawStopReason: string | undefined;
  let sessionId: string | undefined;

  try {
    const stream = query({
      prompt,
      options: buildQueryOptions(cfg),
    });

    for await (const msg of stream) {
      const msgSessionId = getSessionId(msg);
      if (msgSessionId) sessionId = msgSessionId;

      if (msg.type === 'assistant') {
        for (const block of msg.message.content) {
          if (block.type === 'text') {
            textOutput += block.text;
          }
        }
      }

      if (msg.type === 'result') {
        usage = mapUsage(msg);
        rawStopReason = msg.stop_reason ?? undefined;
        if (msg.subtype !== 'success' && !textOutput) {
          textOutput = `Claude execution ended with ${msg.subtype}`;
        }
      }
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: formatErrorMessage(error) }],
      finishReason: { unified: 'error', raw: 'error' },
      usage: usage,
      warnings: [],
      providerMetadata: {
        [PROVIDER_ID]: {
          error: formatErrorMessage(error),
        },
      },
    };
  }

  return {
    content: [{ type: 'text', text: textOutput }],
    finishReason: mapFinishReason(rawStopReason),
    usage,
    warnings: [],
    providerMetadata: {
      [PROVIDER_ID]: {
        sessionId,
        rawStopReason,
      },
    },
  } satisfies LanguageModelV3GenerateResult;
}
