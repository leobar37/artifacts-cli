import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const CONFIG_DIR = ".artifacts";
const CONFIG_FILE = "config.json";

export interface ProjectConfig {
  host?: string | null;
  [key: string]: unknown;
}

function getConfigPath(projectPath: string): string {
  return join(projectPath, CONFIG_DIR, CONFIG_FILE);
}

export function readProjectConfig(projectPath: string): ProjectConfig {
  const configPath = getConfigPath(projectPath);
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content) as ProjectConfig;
  } catch {
    return {};
  }
}

export function writeProjectConfig(
  projectPath: string,
  config: ProjectConfig,
): void {
  const configDir = join(projectPath, CONFIG_DIR);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  const configPath = getConfigPath(projectPath);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function patchProjectConfig(
  projectPath: string,
  partial: Partial<ProjectConfig>,
): ProjectConfig {
  const current = readProjectConfig(projectPath);
  const merged = { ...current, ...partial };
  writeProjectConfig(projectPath, merged);
  return merged;
}
