import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import type { CreateClaudeModelOptions } from './types.js';
import { PROVIDER_ID, STREAM_TEXT_ID } from './types.js';
import { resolveConfig, buildQueryOptions } from './config-resolver.js';
import { serializePrompt } from './prompt-serializer.js';
import {
  mapUsage,
  mapFinishReason,
  emptyUsage,
  getSessionId,
  formatErrorMessage,
} from './usage-mapper.js';

interface ToolCallAccumulator {
  toolCallId: string;
  toolName: string;
  input: string;
  startedInput: boolean;
}

const TOOL_CALL_ID_PREFIX = 'tool_u_';
const REASONING_ID = 'reasoning-0';
let toolCallCounter = 0;

function generateToolCallId(): string {
  return `${TOOL_CALL_ID_PREFIX}${++toolCallCounter}`;
}

export async function doStream(
  options: CreateClaudeModelOptions,
  callOptions: LanguageModelV3CallOptions,
): Promise<LanguageModelV3StreamResult> {
  const cfg = resolveConfig(options, callOptions);
  const prompt = serializePrompt(callOptions.prompt);
  const hasTools = callOptions.tools && callOptions.tools.length > 0;

  const stream = new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      void (async () => {
        let usage = emptyUsage();
        let rawStopReason: string | undefined;
        let startedText = false;
        let sawText = false;
        let startedReasoning = false;
        let sawReasoning = false;
        let sessionId: string | undefined;

        const toolCallMap = new Map<string, ToolCallAccumulator>();
        let currentToolId: string | undefined;

        controller.enqueue({ type: 'stream-start', warnings: [] });

        try {
          const q = query({
            prompt,
            options: buildQueryOptions({
              ...cfg,
              includePartialMessages: true,
            }),
          });

          for await (const msg of q) {
            const msgSessionId = getSessionId(msg);
            if (msgSessionId) sessionId = msgSessionId;

            if (msg.type === 'stream_event') {
              const event = msg.event;

              if (event.type === 'content_block_start') {
                const block = event.content_block as any;
                if (block?.type === 'tool_use') {
                  const toolName = block.name as string;

                  if (hasTools) {
                    const toolCallId = generateToolCallId();
                    currentToolId = toolCallId;

                    toolCallMap.set(toolCallId, {
                      toolCallId,
                      toolName,
                      input: '',
                      startedInput: false,
                    });

                    controller.enqueue({
                      type: 'tool-input-start',
                      id: toolCallId,
                      toolName,
                    } as LanguageModelV3StreamPart);
                  } else {
                    if (!startedText) {
                      controller.enqueue({ type: 'text-start', id: STREAM_TEXT_ID });
                      startedText = true;
                    }
                    sawText = true;
                    controller.enqueue({
                      type: 'text-delta',
                      id: STREAM_TEXT_ID,
                      delta: `[${toolName}] `,
                    });
                  }
                }

                if (block?.type === 'text') {
                  if (!startedText) {
                    controller.enqueue({ type: 'text-start', id: STREAM_TEXT_ID });
                    startedText = true;
                  }
                }

                if (block?.type === 'thinking') {
                  controller.enqueue({ type: 'reasoning-start', id: REASONING_ID });
                  startedReasoning = true;
                }
              }

              if (event.type === 'content_block_delta') {
                const delta = event.delta as any;

                if (delta?.type === 'input_json_delta') {
                  if (hasTools && currentToolId) {
                    const accumulator = toolCallMap.get(currentToolId);
                    if (accumulator) {
                      accumulator.input += delta.partial_json ?? '';
                      if (!accumulator.startedInput) {
                        accumulator.startedInput = true;
                      }
                      controller.enqueue({
                        type: 'tool-input-delta',
                        id: currentToolId,
                        delta: delta.partial_json ?? '',
                      });
                    }
                  } else if (!hasTools && currentToolId) {
                    sawText = true;
                    controller.enqueue({
                      type: 'text-delta',
                      id: STREAM_TEXT_ID,
                      delta: delta.partial_json ?? '',
                    });
                  }
                }

                if (delta?.type === 'text_delta') {
                  if (!startedText) {
                    controller.enqueue({ type: 'text-start', id: STREAM_TEXT_ID });
                    startedText = true;
                  }
                  if (delta.text) {
                    sawText = true;
                    controller.enqueue({
                      type: 'text-delta',
                      id: STREAM_TEXT_ID,
                      delta: delta.text,
                    });
                  }
                }

                if (delta?.type === 'thinking_delta') {
                  if (!startedReasoning) {
                    controller.enqueue({ type: 'reasoning-start', id: REASONING_ID });
                    startedReasoning = true;
                  }
                  if (delta.text) {
                    sawReasoning = true;
                    controller.enqueue({
                      type: 'reasoning-delta',
                      id: REASONING_ID,
                      delta: delta.text,
                    });
                  }
                }
              }

              if (event.type === 'content_block_stop') {
                if (hasTools && currentToolId) {
                  const accumulator = toolCallMap.get(currentToolId);
                  if (accumulator) {
                    controller.enqueue({
                      type: 'tool-call',
                      toolCallId: accumulator.toolCallId,
                      toolName: accumulator.toolName,
                      input: accumulator.input,
                    });
                  }
                  currentToolId = undefined;
                }
                if (startedReasoning) {
                  controller.enqueue({ type: 'reasoning-end', id: REASONING_ID });
                }
              }
            }

            if (msg.type === 'result') {
              usage = mapUsage(msg);
              rawStopReason = msg.stop_reason ?? undefined;
            }
          }

          if (startedText) {
            controller.enqueue({ type: 'text-end', id: STREAM_TEXT_ID });
          }

          if (!sawText && toolCallMap.size === 0 && !sawReasoning) {
            controller.enqueue({ type: 'text-start', id: STREAM_TEXT_ID });
            controller.enqueue({ type: 'text-delta', id: STREAM_TEXT_ID, delta: '' });
            controller.enqueue({ type: 'text-end', id: STREAM_TEXT_ID });
          }

          if (startedReasoning) {
            controller.enqueue({ type: 'reasoning-end', id: REASONING_ID });
          }

          controller.enqueue({
            type: 'finish',
            finishReason: mapFinishReason(rawStopReason),
            usage,
            providerMetadata: {
              [PROVIDER_ID]: {
                sessionId,
                rawStopReason,
              },
            },
          });
        } catch (error) {
          controller.enqueue({
            type: 'error',
            error: new Error(formatErrorMessage(error)),
          });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'error', raw: 'error' },
            usage,
            providerMetadata: {
              [PROVIDER_ID]: {
                error: formatErrorMessage(error),
              },
            },
          });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return {
    stream,
  } satisfies LanguageModelV3StreamResult;
}