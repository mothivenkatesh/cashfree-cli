import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/** ~/.config/cashfree (honors XDG_CONFIG_HOME). */
export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "cashfree");
}

export function ensureConfigDir(): string {
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function credentialsPath(): string {
  return join(configDir(), "credentials.json");
}

export function mockStatePath(): string {
  return join(configDir(), "mock-state.json");
}
