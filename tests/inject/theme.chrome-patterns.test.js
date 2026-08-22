import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("inject/theme.css", "utf8");
const pake = readFileSync("pake.cwa.json", "utf8");
const patternDir = "inject/patterns";
const tiles = [
  "hatch-dark",
  "hatch-light",
  "contour-dark",
  "contour-light",
  "grit-dark",
  "grit-light",
];

function compactSvg(svg) {
  return svg.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

function encodeCssSvg(svg) {
  return encodeURIComponent(compactSvg(svg)).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

describe("CWA chrome SVG textures", () => {
  it("embeds local SVG data-URIs and scopes sheen to owned chrome", () => {
    expect(css).toContain("cwa-theme-sentinel");
    expect(css).toContain("--cwa-chrome-hatch:");
    expect(css).toContain("--cwa-chrome-contour:");
    expect(css).toContain("--cwa-chrome-grit:");
    expect(css).toContain("data:image/svg+xml");
    expect(css).toContain("[data-cwa-chrome].cwa-toolbar::after");
    expect(css).toContain("[data-cwa-chrome].cwa-palette::after");
    expect(css).toContain("[data-cwa-chrome].cwa-export-status::after");
    expect(css).toContain("cwa-chrome-sheen");
    expect(css).not.toMatch(/https?:\/\//);
  });

  it("commits Takumi SVG tiles and inlines the same bytes as data-URIs", () => {
    const names = readdirSync(patternDir).filter((name) => name.endsWith(".svg")).sort();
    expect(names).toEqual([...tiles].map((id) => `${id}.svg`).sort());
    for (const id of tiles) {
      const svg = readFileSync(`${patternDir}/${id}.svg`, "utf8");
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/https:\/\//);
      expect(css).toContain(encodeCssSvg(svg));
    }
    expect(pake).not.toMatch(/inject\/patterns/);
  });

  it("paints teal/gold engraving and laid-paper, not a purple mesh", () => {
    const darkHatch = readFileSync(`${patternDir}/hatch-dark.svg`, "utf8");
    const lightHatch = readFileSync(`${patternDir}/hatch-light.svg`, "utf8");
    expect(darkHatch).toContain("#5eead4");
    expect(darkHatch).toContain("#f0b429");
    expect(lightHatch).toContain("#0f766e");
    expect(lightHatch).toContain("#92400e");
    for (const id of tiles) {
      const svg = readFileSync(`${patternDir}/${id}.svg`, "utf8");
      expect(svg).not.toMatch(/#8b5cf6|#a855f7|#7c3aed|#c084fc/i);
    }
  });

  it("does not wallpaper the provider page with chrome tiles", () => {
    expect(css).not.toMatch(/\bhtml\s*\{[^}]*--cwa-chrome-hatch/s);
    expect(css).not.toMatch(/\bbody\s*\{[^}]*--cwa-chrome-hatch/s);
    expect(css).not.toMatch(/\bmain\s*\{[^}]*cwa-chrome-hatch/s);
    expect(css).toMatch(/body\s*\{[^}]*background-color:\s*var\(--cwa-bg\)/s);
  });

  it("disables chrome sheen under prefers-reduced-motion", () => {
    expect(css).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*\[data-cwa-chrome\]\.cwa-toolbar::after[\s\S]*animation:\s*none/
    );
  });
});
