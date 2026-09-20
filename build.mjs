import * as esbuild from "esbuild";

/** Bundles the side-panel entry (TipTap + app logic) into one IIFE script that
 *  the extension loads directly — MV3-compliant, no remote/CDN code. */
const options = {
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  outfile: "sidepanel.js",
  target: ["chrome110"],
  legalComments: "none",
  minify: true,
  sourcemap: false,
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("[napkin] watching for changes…");
} else {
  await esbuild.build(options);
  console.log("[napkin] built sidepanel.js");
}
