#!/usr/bin/env node
import { run } from "./cli/program.js";

run(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
