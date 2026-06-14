# Generated API types

These TypeScript types are generated from Cashfree's public OpenAPI specs:

```bash
npm run codegen
```

Output (gitignored, regenerate on demand): `pg.ts`, `payout.ts`, `verification.ts`,
from `cashfree-mcp/src/openapi/{openapi-PG,openapi-PO,openapi-VRS}.json`.

They are **not wired into the client yet**. The hand-written client in
[`../http-client.ts`](../http-client.ts) and [`../types.ts`](../types.ts) is the
source of truth today. Use these generated types to:

1. **Check the hand-written types for drift** against the live spec.
2. Serve as the basis for a future migration to fully generated types (so the
   client never drifts from the API).

The generated dir is excluded from the build (`tsconfig.json`) and the published
package, so it never affects runtime or install size.
