import { readFile } from "fs/promises";
import { join } from "path";
import { getLogger } from "./logger.js";

const logger = getLogger();

export interface ShepherdConfig {
  pollInterval: number;
  diffDisplayStyle: "foreground" | "background";
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

/**
 * Load configuration from config.json in the project root
 * Falls back to defaults if config is not found or invalid
 */
export async function loadConfig(
  projectRoot: string
): Promise<ShepherdConfig> {
  const configPath = join(projectRoot, "config.json");

  try {
    const content = await readFile(configPath, "utf-8");
    const userConfig = JSON.parse(content);

    // Merge user config with defaults
    const config: ShepherdConfig = {
      pollInterval:
        userConfig.pollInterval ?? DEFAULT_CONFIG.pollInterval,
      diffDisplayStyle:
        userConfig.diffDisplayStyle ?? DEFAULT_CONFIG.diffDisplayStyle,
      ignorePatterns: [
        ...DEFAULT_CONFIG.ignorePatterns,
        ...(userConfig.ignorePatterns ?? []),
      ],
    };

    logger.info("Loaded configuration", { configPath });
    return config;
  } catch (err) {
    if ((err as any)?.code === "ENOENT") {
      logger.info("No config.json found, using defaults");
    } else {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.warn("Failed to load config.json, using defaults", {
        error: error.message,
      });
    }
    return DEFAULT_CONFIG;
  }
}
