import { readFile, access } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

export type DiffDisplayStyle = "foreground" | "background";

export interface ShepherdConfig {
  pollInterval: number;
  diffDisplayStyle: DiffDisplayStyle;
  ignorePatterns: string[];
}

const DEFAULT_CONFIG: ShepherdConfig = {
  pollInterval: 15000,
  diffDisplayStyle: "foreground",
  ignorePatterns: [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/*.log",
    "**/.claude/**",
  ],
};

// Possible config file locations
const CONFIG_PATHS = [
  // User config directory
  join(homedir(), ".config", "diff-shepherd", "config.json"),
  // Project root (for development)
  join(dirname(fileURLToPath(import.meta.url)), "..", "config.json"),
];

let cachedConfig: ShepherdConfig | null = null;

export async function loadConfig(): Promise<ShepherdConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Try each config path
  for (const configPath of CONFIG_PATHS) {
    try {
      await access(configPath);
      const content = await readFile(configPath, "utf-8");
      const userConfig = JSON.parse(content) as Partial<ShepherdConfig>;

      // Merge with defaults
      cachedConfig = {
        ...DEFAULT_CONFIG,
        ...userConfig,
      };

      return cachedConfig;
    } catch {
      // File doesn't exist or can't be read, try next path
      continue;
    }
  }

  // No config file found, use defaults
  cachedConfig = DEFAULT_CONFIG;
  return cachedConfig;
}

export function getDefaultConfig(): ShepherdConfig {
  return { ...DEFAULT_CONFIG };
}

export async function getConfigPath(): Promise<string | null> {
  for (const configPath of CONFIG_PATHS) {
    try {
      await access(configPath);
      return configPath;
    } catch {
      continue;
    }
  }
  return null;
}
