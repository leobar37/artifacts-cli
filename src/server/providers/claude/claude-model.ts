import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { CreateClaudeModelOptions } from './types.js';
import { doGenerate } from './claude-model-generate.js';
import { doStream } from './claude-model-stream.js';
import { getClaudeCodeDefaults } from './defaults.js';

export function createClaudeModel(options: CreateClaudeModelOptions = {}): LanguageModelV3 {
  const defaultModel = options.model ?? options.modelId ?? getClaudeCodeDefaults().model;

  return {
    specificationVersion: 'v3',
    provider: 'claude-code',
    modelId: defaultModel,
    supportedUrls: {},
    doGenerate: (callOptions) => doGenerate(options, callOptions),
    doStream: (callOptions) => doStream(options, callOptions),
  };
}
