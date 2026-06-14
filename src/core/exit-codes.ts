/**
 * Semantic exit codes. Agents branch on these instead of parsing prose.
 * Stable contract: do not renumber once shipped.
 */
export const ExitCode = {
  OK: 0,
  RUNTIME: 1, // generic runtime / unexpected
  AUTH: 2, // missing or invalid credentials
  VALIDATION: 3, // bad input, caught before any API call
  CONFIRMATION_REQUIRED: 4, // live money-movement needs an explicit confirm
  API: 5, // the API returned an error (4xx/5xx not covered below)
  NOT_FOUND: 6, // resource does not exist (distinct from a 5xx)
  RATE_LIMIT: 7, // 429, see retry_after
  NETWORK: 8, // could not reach the API
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];
