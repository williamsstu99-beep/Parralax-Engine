// Bundles the simulation runtime that runs inside the sandboxed frame.
import { build } from "esbuild";

await build({
  entryPoints: ["src/engine/kit/sandbox.ts"],
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  outfile: "public/kit/runtime.js",
  logLevel: "warning",
});
console.log("built public/kit/runtime.js");
