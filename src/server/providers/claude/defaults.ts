import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { ClaudeEffort } from "./types.js";

export interface ClaudeCodeDefaults {
  model: string;
  effort: ClaudeEffort;
  baseUrl: string;
  authToken: string;
  skipDangerousModePermissionPrompt: boolean;
}

const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

let cachedDefaults: ClaudeCodeDefaults | null = null;

export function getClaudeCodeDefaults(): ClaudeCodeDefaults {
  if (cachedDefaults) return cachedDefaults;

  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    const settings = JSON.parse(raw) as {
      env?: Record<string, string>;
      effortLevel?: string;
      skipDangerousModePermissionPrompt?: boolean;
    };

    const env = settings.env ?? {};
    const model = env["ANTHROPIC_MODEL"] ?? env["ANTHROPIC_DEFAULT_SONNET_MODEL"] ?? "claude-sonnet-4-6";
    const baseUrl = env["ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com";
    const authToken = env["ANTHROPIC_AUTH_TOKEN"] ?? "";

    const effort = ["low", "medium", "high", "max"].includes(settings.effortLevel ?? "")
      ? (settings.effortLevel as ClaudeEffort)
      : "medium";

    cachedDefaults = {
      model,
      effort,
      baseUrl,
      authToken,
      skipDangerousModePermissionPrompt: settings.skipDangerousModePermissionPrompt ?? false,
    };

    return cachedDefaults;
  } catch {
    // Fallback if settings file doesn't exist or can't be read
    cachedDefaults = {
      model: "claude-sonnet-4-6",
      effort: "medium",
      baseUrl: "https://api.anthropic.com",
      authToken: "",
      skipDangerousModePermissionPrompt: false,
    };
    return cachedDefaults;
  }
}

export function invalidateDefaultsCache(): void {
  cachedDefaults = null;
}
