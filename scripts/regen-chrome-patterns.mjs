#!/usr/bin/env node
/**
 * Regen CWA chrome tiles with takumi-js (devDependency, not a runtime inject).
 *
 *   pnpm regen:chrome-patterns
 *
 * Writes inject/patterns/*.svg and inlines compact data-URIs into inject/theme.css.
 * Pake injects CSS as a <style> tag — sibling file URLs do not load in the webview.
 * Do not add these SVGs to pake.cwa.json `inject`. No provider APIs, cookies, or
 * conversation JSON. Network-free: HTML + CSS only, no googleFonts / remote images.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSvg } from "takumi-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PATTERN_DIR = join(ROOT, "inject", "patterns");
const THEME_PATH = join(ROOT, "inject", "theme.css");

/** Distinctive teal/gold engraving + laid-paper. Not a generic purple mesh. */
const TILES = [
  {
    id    : "hatch-dark",
    token : "hatch",
    theme : "dark",
    width : 56,
    height: 56,
    html  : `<div style="width:56px;height:56px;background-image:repeating-linear-gradient(135deg, rgba(94,234,212,0.16) 0px 0.55px, transparent 0.55px 8px), repeating-linear-gradient(28deg, rgba(240,180,41,0.09) 0px 0.35px, transparent 0.35px 14px), repeating-linear-gradient(90deg, transparent 0 13px, rgba(94,234,212,0.06) 13px 13.45px, transparent 13.45px 28px);"></div>`,
  },
  {
    id    : "hatch-light",
    token : "hatch",
    theme : "light",
    width : 40,
    height: 40,
    html  : `<div style="width:40px;height:40px;background-image:repeating-linear-gradient(180deg, rgba(146,64,14,0.10) 0px 0.45px, transparent 0.45px 10px), repeating-linear-gradient(90deg, transparent 0 9px, rgba(15,118,110,0.08) 9px 9.45px, transparent 9.45px 20px), repeating-linear-gradient(135deg, rgba(15,118,110,0.07) 0px 0.35px, transparent 0.35px 16px);"></div>`,
  },
  {
    id    : "contour-dark",
    token : "contour",
    theme : "dark",
    width : 16,
    height: 80,
    html  : `<div style="width:16px;height:80px;overflow:hidden;background-image:repeating-radial-gradient(ellipse 14px 22px at 8px 40px, transparent 0 5px, rgba(94,234,212,0.20) 5px 5.7px, transparent 5.7px 11px), repeating-linear-gradient(90deg, transparent 0 7.6px, rgba(125,211,252,0.10) 7.6px 8.1px, transparent 8.1px 16px);"></div>`,
  },
  {
    id    : "contour-light",
    token : "contour",
    theme : "light",
    width : 16,
    height: 80,
    html  : `<div style="width:16px;height:80px;overflow:hidden;background-image:repeating-radial-gradient(ellipse 14px 22px at 8px 40px, transparent 0 5px, rgba(15,118,110,0.18) 5px 5.7px, transparent 5.7px 11px), repeating-linear-gradient(90deg, transparent 0 7.6px, rgba(7,89,133,0.10) 7.6px 8.1px, transparent 8.1px 16px);"></div>`,
  },
  {
    id    : "grit-dark",
    token : "grit",
    theme : "dark",
    width : 10,
    height: 32,
    html  : `<div style="width:10px;height:32px;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;"><div style="width:1.2px;height:5px;border-radius:999px;background:rgba(139,147,167,0.32)"></div><div style="width:1.2px;height:5px;border-radius:999px;background:rgba(139,147,167,0.32)"></div><div style="width:1.2px;height:5px;border-radius:999px;background:rgba(139,147,167,0.32)"></div></div>`,
  },
  {
    id    : "grit-light",
    token : "grit",
    theme : "light",
    width : 10,
    height: 32,
    html  : `<div style="width:10px;height:32px;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;"><div style="width:1.2px;height:5px;border-radius:999px;background:rgba(75,85,104,0.28)"></div><div style="width:1.2px;height:5px;border-radius:999px;background:rgba(75,85,104,0.28)"></div><div style="width:1.2px;height:5px;border-radius:999px;background:rgba(75,85,104,0.28)"></div></div>`,
  },
];

export function compactSvg(svg) {
  return svg.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

export function encodeCssSvg(svg) {
  // encodeURIComponent leaves () unescaped; quoted CSS url() parsers (happy-dom)
  // still split on inner url(#id) unless parentheses are percent-encoded.
  return encodeURIComponent(compactSvg(svg)).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

export function toCssDataUri(svg) {
  return `url("data:image/svg+xml,${encodeCssSvg(svg)}")`;
}

function tidySvg(svg, idPrefix) {
  let out = svg
    .replace(/<g clip-path="[^"]*">\s*<\/g>\s*/g, "")
    .replace(/<clipPath[\s\S]*?<\/clipPath>\s*/g, "")
    .replace(/\n{3,}/g, "\n\n");
  out = out.replace(/\bid="([^"]+)"/g, (_m, id) => `id="${idPrefix}-${id}"`);
  out = out.replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#${idPrefix}-${id})`);
  return `${out.trim()}\n`;
}

function patchTheme(css, uris) {
  const counts = { hatch: 0, contour: 0, grit: 0 };
  const next = css.replace(
    /--cwa-chrome-(hatch|contour|grit):\s*url\("data:image\/svg\+xml,[^"]+"\)/g,
    (_m, token) => {
      counts[token] += 1;
      const theme = counts[token] === 1 ? "dark" : "light";
      const uri = uris[`${token}-${theme}`];
      if (!uri) {
        throw new Error(`missing data-URI for ${token}-${theme}`);
      }
      return `--cwa-chrome-${token}: ${uri}`;
    }
  );
  for (const [token, count] of Object.entries(counts)) {
    if (count !== 3) {
      throw new Error(`expected 3 --cwa-chrome-${token} data-URIs, found ${count}`);
    }
  }
  return next;
}

export async function regenChromePatterns({ write = true } = {}) {
  mkdirSync(PATTERN_DIR, { recursive: true });
  const uris = {};
  const files = [];

  for (const tile of TILES) {
    const raw = await renderSvg(tile.html, { width: tile.width, height: tile.height });
    if (typeof raw !== "string" || !raw.includes("<svg")) {
      throw new Error(`takumi-js did not return SVG for ${tile.id}`);
    }
    const svg = tidySvg(raw, tile.id);
    if (/https:\/\//.test(svg) || /http:\/\/(?!www\.w3\.org\/)/.test(svg)) {
      throw new Error(`${tile.id} contains a remote URL`);
    }
    const dest = join(PATTERN_DIR, `${tile.id}.svg`);
    if (write) {
      writeFileSync(dest, svg);
    }
    uris[tile.id] = toCssDataUri(svg);
    files.push({ id: tile.id, bytes: svg.length, dest });
  }

  const css = readFileSync(THEME_PATH, "utf8");
  const patched = patchTheme(css, uris);
  if (write) {
    writeFileSync(THEME_PATH, patched);
  }
  return { files, themePatched: patched !== css };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = await regenChromePatterns();
  for (const file of result.files) {
    process.stdout.write(`${file.id} ${file.bytes}B\n`);
  }
  process.stdout.write(`theme.css ${result.themePatched ? "updated" : "unchanged"}\n`);
}
