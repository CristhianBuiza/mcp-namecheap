import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Saved settings, keyed by environment variable name (e.g. NAMECHEAP_API_KEY). */
export type Settings = Record<string, string>;

export function settingsFile(): string {
  if (process.env.NAMECHEAP_CONFIG_FILE) return process.env.NAMECHEAP_CONFIG_FILE;
  const base =
    process.env.XDG_CONFIG_HOME ||
    (process.platform === "win32"
      ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
      : join(homedir(), ".config"));
  return join(base, "mcp-namecheap", "config.json");
}

export function readSettings(file = settingsFile()): Settings {
  if (!existsSync(file)) return {};
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${file} must contain a JSON object`);
  }
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export function writeSettings(settings: Settings, file = settingsFile()) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

/** Fills environment variables that are not already set from the saved settings. */
export function applySettings(file = settingsFile()) {
  for (const [key, value] of Object.entries(readSettings(file))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
