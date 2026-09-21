export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'max';

export type ClaudeThinkingDisplay = 'summarized' | 'omitted';

export type ClaudeThinkingEnabled = {
  type: 'enabled';
  budgetTokens?: number;
  display?: ClaudeThinkingDisplay;
};

export type ClaudeThinkingDisabled = {
  type: 'disabled';
};

export type ClaudeThinkingAdaptive = {
  type: 'adaptive';
  display?: ClaudeThinkingDisplay;
};

export type ClaudeThinkingConfig = ClaudeThinkingEnabled | ClaudeThinkingDisabled | ClaudeThinkingAdaptive;

export type ClaudeProviderOptions = {
  cwd?: string;
  model?: string;
  permissionMode?: ClaudePermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
  persistSession?: boolean;
  resume?: string;
  sessionId?: string;
  maxTurns?: number;
  effort?: ClaudeEffort;
  thinking?: ClaudeThinkingConfig;
};

export type CreateClaudeModelOptions = ClaudeProviderOptions & {
  modelId?: string;
};

export const PROVIDER_ID = 'claude-code';
export const STREAM_TEXT_ID = 'text-0';
