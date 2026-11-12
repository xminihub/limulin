/**
 * Build the portable JS bundle for the npm package: dist/lim.js
 *
 * A thin ESM bundle of app code (target: node) with a `#!/usr/bin/env node`
 * shebang, runnable under both Node >=22 and Bun. OpenTUI's per-platform
 * native renderer resolves from node_modules at runtime via @opentui/core's
 * optionalDependencies — it cannot be embedded in a plain-JS artifact.
 * The version is baked in via the LIMULIN_VERSION define so the bundle
 * never needs package.json at runtime.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const pkg: { version: string } = await Bun.file("package.json").json();
const VERSION = pkg.version;

mkdirSync("dist", { recursive: true });

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "node",
  format: "esm",
  naming: "lim.js",
  define: {
    "process.env.LIMULIN_VERSION": JSON.stringify(VERSION),
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// bun build stamps its own shebang on executable entries; the published
// artifact must run under node by default.
const outFile = "dist/lim.js";
const body = readFileSync(outFile, "utf8");
const withoutShebang = body.startsWith("#!")
  ? body.slice(body.indexOf("\n") + 1)
  : body;
writeFileSync(outFile, `#!/usr/bin/env node\n${withoutShebang}`);
await Bun.spawn(["chmod", "+x", outFile]);

console.log(`built ${outFile} (v${VERSION})`);
