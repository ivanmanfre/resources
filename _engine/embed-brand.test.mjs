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
