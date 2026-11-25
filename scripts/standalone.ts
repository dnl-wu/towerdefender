// Export the spectator view and its compiled Tailwind styles as an offline page.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const stylesheet = resolve("src/app/globals.css");
const { css } = await postcss([tailwindcss({ optimize: true })]).process(
  readFileSync(stylesheet, "utf8"), { from: stylesheet },
);

const bundle = execFileSync("bun", [
  "build", "src/viewer/standalone.tsx", "--minify", "--target", "browser", "--define", 'process.env.NODE_ENV="production"',
], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tower Defender · spectator</title>
<style>${css}</style></head>
<body><div id="root" class="mx-auto max-w-[1152px] p-2 sm:p-4"></div>
<script>${bundle.replace(/<\/script/gi, "<\\/script")}</script></body></html>
`;

const file = "design/spectator.html";
mkdirSync("design", { recursive: true });
writeFileSync(file, html);
console.log(file);
