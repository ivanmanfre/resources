/* LM embed brand-mirror math — pure, DOM-free. window.LMEmbed + Node module.
   Ported verbatim from assessment.js:198-382 (embed color/font/identity CSS
   generation). All DOM writes there (createElement/appendChild) become
   string return values here so this module is testable without a browser
   and reusable by v2's render(). Do not drop rules when editing — see
   task-4-brief.md for the port contract. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.LMEmbed = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function clamp(x) { return Math.max(0, Math.min(255, Math.round(x))); }
  function parse(h) {
    h = (h || "").replace(/[^0-9a-fA-F]/g, "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function hex(c) { return "#" + c.map(function (x) { return clamp(x).toString(16).padStart(2, "0"); }).join(""); }
  function mix(c, t, a) { return [c[0] + (t[0] - c[0]) * a, c[1] + (t[1] - c[1]) * a, c[2] + (t[2] - c[2]) * a]; }
  function safeFam(n) { n = (n || "").replace(/[^\w \-]/g, "").trim(); return n; }

  function buildEmbedVars(params) {
    var rgb = parse(params.get("accent")) || [91, 130, 166]; // slate fallback
    // Prospect fonts: the pipeline reads the lead's REAL typefaces off their site and (guardrail)
    // only forwards them when they resolve to loadable Google families. ?font= heading, ?fontb=
    // body. Absent (custom/unloadable font, or no brand) → a neutral system sans, never Ivan's serif.
    var NEUTRAL = '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,Helvetica,Arial,sans-serif';
    var qHead = safeFam(params.get("font"));
    var qBody = safeFam(params.get("fontb")) || qHead;
    var HEAD = qHead ? '"' + qHead + '",' + NEUTRAL : NEUTRAL;
    var BODY = qBody ? '"' + qBody + '",' + NEUTRAL : NEUTRAL;
    // ?hero=dark — opt-in dark hero theme (see block further down). Parsed early
    // because the dark hero sets the headline at display weight 800 + italic cuts,
    // so the heading family needs those axes requested up front.
    var heroDark = (params.get("hero") || "").trim() === "dark";
    var headAxes = heroDark
      ? ":ital,wght@0,400;0,500;0,700;0,800;1,400;1,600;1,700;1,800"
      : ":ital,wght@0,400;0,500;0,700;1,400";
    var fontLink = null;
    if (qHead || qBody) {
      var fams = [];
      if (qHead) fams.push("family=" + encodeURIComponent(qHead).replace(/%20/g, "+") + headAxes);
      if (qBody && qBody !== qHead) fams.push("family=" + encodeURIComponent(qBody).replace(/%20/g, "+") + ":wght@400;500;600;700");
      fontLink = "https://fonts.googleapis.com/css2?" + fams.join("&") + "&display=swap";
    }
    var css = ".lmc-embed .lmc-root{" +
      "--accent:" + hex(rgb) + ";" +
      "--accent-light:" + hex(mix(rgb, [255, 255, 255], 0.32)) + ";" +
      "--accent-ink:" + hex(mix(rgb, [0, 0, 0], 0.26)) + ";" +
      "--accent-soft:" + hex(rgb) + "14;" +
      "--accent-glow:rgba(" + clamp(rgb[0]) + "," + clamp(rgb[1]) + "," + clamp(rgb[2]) + ",.18);" +
      "--font-sans:" + BODY + ";--font-drama:" + HEAD + ";--font-mono:" + BODY + "}" +
      // Beat the hardcoded `!important` serif rules in shared.css/assessment.css. Body font
      // everywhere, the lead's display font on the headline surfaces.
      "html.lmc-embed .lmc-root,html.lmc-embed .lmc-root *{font-family:" + BODY + " !important;letter-spacing:normal !important}" +
      "html.lmc-embed .lmc-h1,html.lmc-embed .lmc-h1 *,html.lmc-embed .lmc-question,html.lmc-embed .lmc-question *,html.lmc-embed .lmc-intro-h,html.lmc-embed .lmc-intro-h *,html.lmc-embed .lmc-start-h,html.lmc-embed .lmc-start-h *,html.lmc-embed .lmc-capture h3,html.lmc-embed .lmc-score-ring .num,html.lmc-embed .lmc-score-hero .lmc-score-num{font-family:" + HEAD + " !important}";
    // The italic-pivot highlight sweep behind the H1/intro headline is a hardcoded green
    // SVG (fill=#131210) — the accent CSS var can't reach a data-uri, so it stayed Ivan-green
    // even in a slate/orange embed. Rebuild the same wavy sweep in the LEAD's accent.
    var sweep = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 100' preserveAspectRatio='none'><path d='M 6 14 Q 70 10 140 14 Q 220 18 290 12 Q 350 15 394 16 L 394 86 Q 350 88 290 84 Q 220 92 140 86 Q 70 90 6 84 Z' fill='%23" + hex(rgb).slice(1) + "' opacity='0.78'/></svg>\")";
    css += "html.lmc-embed .lmc-h1 em::after,html.lmc-embed .lmc-h1 i::after,html.lmc-embed .lmc-start-h em::after,html.lmc-embed .lmc-start-h i::after,html.lmc-embed .lmc-intro-h em::after,html.lmc-embed .lmc-intro-h i::after{background-image:" + sweep + " !important}";
    css += ".lmc-embed-logo{display:block;height:34px;width:auto;max-width:190px;margin:0 0 1.5rem;object-fit:contain}";
    // Uniform intro icons: the editorial a/b/c treatment (accent / ink / outline)
    // reads as three accidental styles inside a client brand — one accent chip.
    // Emitted BEFORE the light-accent contrast guard so the deepened version
    // still wins when the accent is too light for white glyphs.
    css += "html.lmc-embed .lmc-intro-icon,html.lmc-embed .lmc-intro-icon.a,html.lmc-embed .lmc-intro-icon.b,html.lmc-embed .lmc-intro-icon.c{background:" + hex(rgb) + " !important;color:#fff !important;border:none !important}";
    // Contrast guard: a light brand accent (amber, mint, yellow) with white glyphs on it reads
    // washed out. When the accent is light, deepen the filled icon/pill chips so the white text
    // stays legible on the light paper.
    var lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    if (lum > 0.62) {
      var deep = hex(mix(rgb, [0, 0, 0], 0.45));
      css += "html.lmc-embed .lmc-intro-icon,html.lmc-embed .lmc-intro-icon.a,html.lmc-embed .lmc-intro-icon.b,html.lmc-embed .lmc-intro-icon.c{background:" + deep + " !important}";
    }
    // ?bg=RRGGBB — surface override. Ivan's warm cream paper reads off-brand inside a
    // clean-white or dark prospect site mockup; this swaps the paper family for theirs.
    var bgRgb = parse(params.get("bg"));
    if (bgRgb) {
      var sunk = hex(mix(bgRgb, [15, 23, 42], 0.05));
      css += "html.lmc-embed body,html.lmc-embed .lmc-root{--paper:" + hex(bgRgb) + ";--paper-sunk:" + sunk + ";background:" + hex(bgRgb) + " !important}";
    }
    // Deep brand pass. The engine's editorial ink-black buttons, DM Serif capture
    // heading, sage score-glow and critical-tier ink are IVAN tells inside a client
    // brand embed — accent-drive them. ?r= (radius px) + ?ink=RRGGBB complete the kit;
    // several targets hardcode colors/radius literals, so vars alone can't reach them.
    css += ".lmc-embed .lmc-btn,.lmc-embed .lmc-intro-start{background:" + hex(rgb) + " !important;color:#fff !important}" +
      ".lmc-embed .lmc-btn:hover,.lmc-embed .lmc-intro-start:hover{background:" + hex(mix(rgb, [0, 0, 0], 0.26)) + " !important}" +
      "html.lmc-embed .lmc-capture h2{font-family:" + HEAD + " !important}" +
      ".lmc-embed .lmc-score-hero{background:radial-gradient(ellipse at 50% 0%,rgba(" + clamp(rgb[0]) + "," + clamp(rgb[1]) + "," + clamp(rgb[2]) + ",0.10) 0%,transparent 70%) !important}" +
      ".lmc-embed [data-tier=critical] .ring-fill{stroke:" + hex(rgb) + " !important}" +
      ".lmc-embed [data-tier=critical] .lmc-score-number{color:" + hex(rgb) + " !important}" +
      ".lmc-embed [data-tier=critical] .lmc-score-eyebrow::before{background:" + hex(rgb) + " !important}" +
      ".lmc-embed [data-tier=critical] .lmc-score-headline em{color:" + hex(rgb) + " !important}" +
      ".lmc-embed .lmc-result .lmc-rec{border-left-color:rgba(" + clamp(rgb[0]) + "," + clamp(rgb[1]) + "," + clamp(rgb[2]) + ",0.35) !important}";
    var rPx = parseInt(params.get("r") || "", 10);
    if (!isNaN(rPx) && rPx >= 0 && rPx <= 24) {
      css += ".lmc-embed .lmc-btn,.lmc-embed .lmc-intro-start,.lmc-embed .lmc-btn-secondary,.lmc-embed .lmc-opt,.lmc-embed .lmc-card,.lmc-embed .lmc-form-input,.lmc-embed .lmc-capture{border-radius:" + rPx + "px !important}";
    }
    var inkRgb = parse(params.get("ink"));
    if (inkRgb) {
      var inkHex = hex(inkRgb);
      css += ".lmc-embed .lmc-root{--ink:" + inkHex + ";--ink-soft:" + hex(mix(inkRgb, [255, 255, 255], 0.22)) + ";--ink-mute:" + hex(mix(inkRgb, [255, 255, 255], 0.34)) + "}" +
        ".lmc-embed .lmc-score-eyebrow,.lmc-embed .lmc-score-headline,.lmc-embed .lmc-score-note strong,.lmc-embed .lmc-category-block h4,.lmc-embed .lmc-result-unlock-h,.lmc-embed .lmc-start-h,.lmc-embed .lmc-start-meta{color:" + inkHex + " !important}" +
        ".lmc-embed .lmc-score-note,.lmc-embed .lmc-start-p{color:" + hex(mix(inkRgb, [255, 255, 255], 0.22)) + " !important}";
    }
    // Template-tell pass (all embeds): the graph-paper hero grid and the hard
    // 6px square eyebrow/meta markers are Ivan-editorial signatures — inside a
    // client-brand embed they read as a reused template. Grid off, markers
    // become small round dots. Public (non-embed) LM pages are untouched.
    css += ".lmc-embed .lmc-hero{background-image:none !important}" +
      ".lmc-embed .lmc-badge::before,.lmc-embed .lmc-meta-chip::before,.lmc-embed .lmc-intro-badge::before,.lmc-embed .lmc-category::before,.lmc-embed .lmc-tier-pill::before,.lmc-embed .lmc-start-meta-dot{width:5px !important;height:5px !important;border-radius:50% !important}";
    // ?hero=dark&hero_bg=RRGGBB&accent2=RRGGBB — dark hero theme. Mirrors a
    // dark-hero brand site (e.g. deep forest green with a mint secondary):
    // hero surface = hero_bg, headline white at display weight, the em/i pivot
    // words render INLINE ITALIC in accent2 (their "Paid Ads & SEO" move) with
    // the wavy sweep killed, meta chips as white/50 text with small accent2
    // dots. Everything below the hero keeps the ?bg surface. Opt-in only.
    if (heroDark) {
      var hb = parse(params.get("hero_bg")) || inkRgb || [11, 35, 31];
      var a2 = parse(params.get("accent2")) || rgb;
      var hbHex = hex(hb), a2Hex = hex(a2);
      css += "html.lmc-embed .lmc-hero{background:" + hbHex + " !important;border-bottom:none !important;padding:4.5rem 1.5rem 4rem}" +
        "html.lmc-embed .lmc-hero::after{background:radial-gradient(ellipse 75% 60% at 82% 18%,rgba(" + clamp(a2[0]) + "," + clamp(a2[1]) + "," + clamp(a2[2]) + ",0.10),transparent 65%) !important}" +
        "html.lmc-embed .lmc-h1{color:#fff !important;font-weight:800 !important;font-size:clamp(2.35rem,5.5vw,3.7rem) !important;line-height:1.1 !important;letter-spacing:-0.015em !important;max-width:46rem}" +
        "html.lmc-embed .lmc-h1 em,html.lmc-embed .lmc-h1 i{color:" + a2Hex + " !important;font-style:italic !important;font-weight:800 !important;display:inline !important;padding:0 !important;isolation:auto !important}" +
        "html.lmc-embed .lmc-h1 em::after,html.lmc-embed .lmc-h1 i::after{content:none !important;background-image:none !important}" +
        "html.lmc-embed .lmc-sub{color:rgba(255,255,255,0.75) !important;font-style:italic}" +
        "html.lmc-embed .lmc-badge{color:rgba(255,255,255,0.55) !important}" +
        "html.lmc-embed .lmc-badge::before{background:" + a2Hex + " !important}" +
        "html.lmc-embed .lmc-meta,html.lmc-embed .lmc-meta-chip{color:rgba(255,255,255,0.5) !important}" +
        "html.lmc-embed .lmc-meta-chip::before{background:" + a2Hex + " !important}" +
        "html.lmc-embed .lmc-embed-logo{margin-bottom:2rem}" +
        // Below the hero the sweep highlighter is the loudest Ivan tell — off.
        // Italic pivots there render inline in the primary accent (dark enough
        // on the ?bg white surface), matching the brand's light sections.
        "html.lmc-embed .lmc-start-h em::after,html.lmc-embed .lmc-start-h i::after,html.lmc-embed .lmc-intro-h em::after,html.lmc-embed .lmc-intro-h i::after{content:none !important;background-image:none !important}" +
        "html.lmc-embed .lmc-start-h em,html.lmc-embed .lmc-start-h i,html.lmc-embed .lmc-intro-h em,html.lmc-embed .lmc-intro-h i{color:" + hex(rgb) + " !important;display:inline !important;padding:0 !important;isolation:auto !important}" +
        // Dark-hero brands set section headings bold — the 400-weight display
        // serif metrics read as someone else's site once the serif is swapped out.
        "html.lmc-embed .lmc-intro-h,html.lmc-embed .lmc-start-h,html.lmc-embed .lmc-question{font-weight:700 !important;letter-spacing:-0.01em !important}" +
        "html.lmc-embed .lmc-start-h{max-width:34rem !important}";
    }
    return { css: css, fontLink: fontLink };
  }

  return { clamp: clamp, parse: parse, hex: hex, mix: mix, safeFam: safeFam, buildEmbedVars: buildEmbedVars };
});
