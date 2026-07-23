import assert from "node:assert/strict";
import { test } from "node:test";
import embed from "./embed-brand.js";

test("parse handles 3- and 6-digit hex, rejects junk", () => {
  assert.deepEqual(embed.parse("#0f0"), [0, 255, 0]);
  assert.deepEqual(embed.parse("2a8f65"), [42, 143, 101]);
  assert.equal(embed.parse("nope"), null);
});

test("hex round-trips and clamps", () => {
  assert.equal(embed.hex([42, 143, 101]), "#2a8f65");
  assert.equal(embed.clamp(300), 255);
});

test("safeFam strips unsafe chars", () => {
  assert.equal(embed.safeFam("DM Serif Display; }"), "DM Serif Display");
});

test("buildEmbedVars maps ?accent to --accent CSS", () => {
  const p = new URLSearchParams("accent=2a8f65");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes("--accent:#2a8f65"));
});

test("buildEmbedVars builds Google Fonts link + font-family overrides", () => {
  const p = new URLSearchParams("font=Poppins");
  const { css, fontLink } = embed.buildEmbedVars(p);
  assert.ok(fontLink && fontLink.includes("Poppins"));
  assert.ok(css.includes('"Poppins"'));
});

test("buildEmbedVars applies ?bg surface override", () => {
  const p = new URLSearchParams("bg=ffffff");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes("--paper:#ffffff"));
});

test("buildEmbedVars applies ?ink pass", () => {
  const p = new URLSearchParams("ink=112233");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes("--ink:#112233"));
});

test("buildEmbedVars applies ?r radius override within bounds", () => {
  const p = new URLSearchParams("r=8");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes("border-radius:8px !important"));
});

test("buildEmbedVars ignores out-of-range ?r", () => {
  const p = new URLSearchParams("r=99");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(!css.includes("border-radius:99px"));
});

test("buildEmbedVars applies ?hero=dark theme with hero_bg/accent2", () => {
  const p = new URLSearchParams("hero=dark&hero_bg=0b231f&accent2=00ff88");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes("background:#0b231f !important"));
  assert.ok(css.includes("color:#00ff88 !important"));
});

test("buildEmbedVars always includes the template-tell pass", () => {
  const p = new URLSearchParams("accent=ff6a00");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes(".lmc-embed .lmc-hero{background-image:none !important}"));
});

// Color-math coverage: mix()-derived var, the lum > 0.62 contrast-guard branch,
// and the no-?accent slate fallback. Expected hex literals computed via
// `embed.hex(embed.mix(...))` for the exact inputs below and pinned here so the
// tests assert the port's math, not just direct hex passthrough.
test("buildEmbedVars derives --accent-light via mix(), not passthrough", () => {
  const p = new URLSearchParams("accent=2a8f65");
  const { css } = embed.buildEmbedVars(p);
  // mix([42,143,101],[255,255,255],0.32) -> hex -> #6eb396
  assert.ok(css.includes("--accent-light:#6eb396"));
});

test("buildEmbedVars deepens intro-icon fill when accent is light (lum > 0.62 contrast guard)", () => {
  const p = new URLSearchParams("accent=ffe08a");
  const rgb = embed.parse("ffe08a");
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  assert.ok(lum > 0.62, "fixture accent must exceed the contrast-guard threshold");
  const { css } = embed.buildEmbedVars(p);
  // mix([255,224,138],[0,0,0],0.45) -> hex -> #8c7b4c
  assert.ok(css.includes(".lmc-intro-icon.c{background:#8c7b4c !important}"));
});

test("buildEmbedVars falls back to slate #5b82a6 when ?accent is absent", () => {
  const p = new URLSearchParams("");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes("--accent:#5b82a6"));
});

// --- Sparse-brand derivation: accent is the ONLY brand signal (the common scan case).
// Synthesizes a tinted page field, a deep accent-dark hero band, and re-points the
// editorial ink family (--sage/--ink/--line) into the accent hue.
test("sparse derivation fires when only ?accent is present (accent=5b82a6)", () => {
  const p = new URLSearchParams("accent=5b82a6");
  const { css } = embed.buildEmbedVars(p);
  const rgb = embed.parse("5b82a6");
  // Tinted page field: mix(accent,white,0.955)
  assert.ok(css.includes("--paper:" + embed.hex(embed.mix(rgb, [255, 255, 255], 0.955))));
  // Deep accent-dark hero band: mix(accent,[17,17,17],0.80)
  assert.ok(css.includes("html.lmc-embed .lmc-hero{background:" + embed.hex(embed.mix(rgb, [17, 17, 17], 0.80)) + " !important"));
  // White headline on the dark band
  assert.ok(css.includes("html.lmc-embed .lmc-h1{color:#fff !important}"));
  // Editorial ink accents re-pointed into the accent hue via --sage = mix(accent,black,0.35)
  assert.ok(css.includes("--sage:" + embed.hex(embed.mix(rgb, [0, 0, 0], 0.35))));
});

test("sparse derivation generalizes across hues (red + green produce their own dark band)", () => {
  for (const h of ["e02020", "2a8f65"]) {
    const rgb = embed.parse(h);
    const { css } = embed.buildEmbedVars(new URLSearchParams("accent=" + h));
    assert.ok(css.includes("html.lmc-embed .lmc-hero{background:" + embed.hex(embed.mix(rgb, [17, 17, 17], 0.80)) + " !important"), h + " hero band");
    assert.ok(css.includes("--paper:" + embed.hex(embed.mix(rgb, [255, 255, 255], 0.955))), h + " field");
  }
});

test("sparse derivation is SUPPRESSED when ?bg is explicit (existing behavior preserved)", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=5b82a6&bg=ffffff"));
  assert.ok(!css.includes("html.lmc-embed .lmc-hero{background:"), "no synthesized hero band");
  assert.ok(css.includes("--paper:#ffffff"), "explicit bg still wins");
});

test("sparse derivation is SUPPRESSED when ?ink is explicit", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=5b82a6&ink=112233"));
  assert.ok(!css.includes("html.lmc-embed .lmc-hero{background:"));
});

test("sparse derivation is SUPPRESSED when ?hero=dark is explicit", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=5b82a6&hero=dark"));
  // The dark-hero branch owns the hero here; the sparse --sage re-point must NOT appear.
  assert.ok(!css.includes("--sage:" + embed.hex(embed.mix(embed.parse("5b82a6"), [0, 0, 0], 0.35))));
});

test("sparse derivation does NOT fire when ?accent is absent (no synthesized band on bare fallback)", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams(""));
  assert.ok(!css.includes("html.lmc-embed .lmc-hero{background:"));
});
