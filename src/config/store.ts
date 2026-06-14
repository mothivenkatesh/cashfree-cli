import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { ensureConfigDir, credentialsPath } from "./paths.js";
import type { Mode } from "./environment.js";
import type { Credentials } from "../api/http-client.js";

/**
 * Credential store. File-backed at ~/.config/cashfree/credentials.json with
 * 0600 perms. Secrets are never printed, never passed in argv, never logged.
 * (Hardening to the OS keychain is the planned next step; the contract above
 * is what gate G1 checks.)
 */
interface ProfileCreds {
  sandbox?: Credentials;
  live?: Credentials;
}

interface Store {
  current_profile: string;
  profiles: Record<string, ProfileCreds>;
}

const EMPTY: Store = { current_profile: "default", profiles: {} };

function load(): Store {
  const p = credentialsPath();
  if (!existsSync(p)) return structuredClone(EMPTY);
  try {
    return { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(p, "utf8")) };
  } catch {
    return structuredClone(EMPTY);
  }
}

function save(store: Store): void {
  ensureConfigDir();
  const p = credentialsPath();
  writeFileSync(p, JSON.stringify(store, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600); // enforce even if the file pre-existed
}

export function setCredentials(profile: string, mode: Mode, creds: Credentials): void {
  const store = load();
  store.profiles[profile] ??= {};
  store.profiles[profile][mode] = creds;
  store.current_profile = profile;
  save(store);
}

export function getCredentials(profile: string, mode: Mode): Credentials | undefined {
  // Environment variables win, so CI and agents can run without a stored file.
  const envId = process.env.CASHFREE_CLIENT_ID;
  const envSecret = process.env.CASHFREE_CLIENT_SECRET;
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret };

  return load().profiles[profile]?.[mode];
}

export function clearCredentials(profile: string): void {
  const store = load();
  delete store.profiles[profile];
  save(store);
}

export function currentProfile(): string {
  return load().current_profile;
}

/** Show only the first 4 and last 2 characters of a secret. */
export function mask(secret: string): string {
  if (secret.length <= 6) return "****";
  return `${secret.slice(0, 4)}…${secret.slice(-2)}`;
}
