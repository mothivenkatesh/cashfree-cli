import { CashfreeError } from "../core/errors.js";

export type Values = Record<string, string | boolean | (string | boolean)[] | undefined>;

export interface Input {
  positionals: string[];
  values: Values;
}

function last(v: string | boolean | (string | boolean)[] | undefined): string | boolean | undefined {
  return Array.isArray(v) ? v[v.length - 1] : v;
}

export function flagStr(values: Values, name: string): string | undefined {
  const v = last(values[name]);
  return typeof v === "string" ? v : undefined;
}

export function flagBool(values: Values, name: string): boolean {
  return last(values[name]) === true;
}

export function requireStr(values: Values, name: string, hint?: string): string {
  const v = flagStr(values, name);
  if (v === undefined || v === "") {
    throw CashfreeError.validation(`Missing required --${name}.`, hint);
  }
  return v;
}

export function flagNum(values: Values, name: string): number | undefined {
  const v = flagStr(values, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw CashfreeError.validation(`--${name} must be a number, got '${v}'.`);
  }
  return n;
}

export function requireNum(values: Values, name: string): number {
  const n = flagNum(values, name);
  if (n === undefined) throw CashfreeError.validation(`Missing required --${name}.`);
  return n;
}
