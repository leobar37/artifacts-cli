import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import type { ClaudePermissionMode, ClaudeProviderOptions, ClaudeEffort, ClaudeThinkingConfig, CreateClaudeModelOptions } from './types.js';
import { PROVIDER_ID } from './types.js';
import { getClaudeCodeDefaults } from './defaults.js';

export function resolveConfig(
  defaults: CreateClaudeModelOptions,
  callOptions: LanguageModelV3CallOptions,
): ClaudeProviderOptions {
  const providerOptionsRaw = (callOptions.providerOptions?.[PROVIDER_ID] ?? {}) as Record<string, unknown>;
  const ccDefaults = getClaudeCodeDefaults();

  const fromProvider: ClaudeProviderOptions = {
    cwd: asString(providerOptionsRaw.cwd),
    model: asString(providerOptionsRaw.model),
    permissionMode: asPermissionMode(providerOptionsRaw.permissionMode),
    allowedTools: asStringArray(providerOptionsRaw.allowedTools),
    disallowedTools: asStringArray(providerOptionsRaw.disallowedTools),
    persistSession: asBoolean(providerOptionsRaw.persistSession),
    resume: asString(providerOptionsRaw.resume),
    sessionId: asString(providerOptionsRaw.sessionId),
    maxTurns: asNumber(providerOptionsRaw.maxTurns),
    effort: asEffort(providerOptionsRaw.effort),
    thinking: asThinking(providerOptionsRaw.thinking),
  };

  return {
    cwd: fromProvider.cwd ?? defaults.cwd,
    model: fromProvider.model ?? defaults.model ?? defaults.modelId ?? ccDefaults.model,
    permissionMode: fromProvider.permissionMode ?? defaults.permissionMode,
    allowedTools: fromProvider.allowedTools ?? defaults.allowedTools,
    disallowedTools: fromProvider.disallowedTools ?? defaults.disallowedTools,
    persistSession: fromProvider.persistSession ?? defaults.persistSession,
    resume: fromProvider.resume ?? defaults.resume,
    sessionId: fromProvider.sessionId ?? defaults.sessionId,
    maxTurns: fromProvider.maxTurns ?? defaults.maxTurns,
    effort: fromProvider.effort ?? defaults.effort ?? ccDefaults.effort,
    thinking: fromProvider.thinking ?? defaults.thinking,
  };
}

export function buildQueryOptions(config: ClaudeProviderOptions & { includePartialMessages?: boolean }) {
  return {
    cwd: config.cwd,
    model: config.model,
    permissionMode: config.permissionMode,
    allowedTools: config.allowedTools,
    disallowedTools: config.disallowedTools,
    persistSession: config.persistSession,
    resume: config.resume,
    sessionId: config.sessionId,
    maxTurns: config.maxTurns,
    effort: config.effort,
    thinking: config.thinking,
    includePartialMessages: config.includePartialMessages,
    allowDangerouslySkipPermissions: config.permissionMode === 'bypassPermissions' ? true : undefined,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === 'string');
}

function asPermissionMode(value: unknown): ClaudePermissionMode | undefined {
  if (
    value === 'default' ||
    value === 'acceptEdits' ||
    value === 'bypassPermissions' ||
    value === 'plan' ||
    value === 'dontAsk' ||
    value === 'auto'
  ) {
    return value;
  }
  return undefined;
}

function asEffort(value: unknown): ClaudeEffort | undefined {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'max') {
    return value;
  }
  return undefined;
}

function asThinking(value: unknown): ClaudeThinkingConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (obj.type === 'enabled' || obj.type === 'disabled' || obj.type === 'adaptive') {
    return obj as ClaudeThinkingConfig;
  }
  return undefined;
}
