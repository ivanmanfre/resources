/* LM Assessment Engine — JSON-spec driven, single <style>, keyboard-accessible, partial-reveal capture */
(function () {
  "use strict";
  var BEACON = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";

  function $(s, c) { return (c || document).querySelector(s); }
  function make(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html !== undefined) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  var escapeHtml = esc;
  function toast(msg) { var t = $("#lmc-toast"); if (!t) { t = make("div", { id: "lmc-toast", class: "lmc-toast" }); document.body.appendChild(t); } t.textContent = msg; t.classList.add("show"); setTimeout(function () { t.classList.remove("show"); }, 2500); }
  function beacon(event_type, payload) {
    try {
      var q = new URLSearchParams(location.search);
      var body = Object.assign({ event_type: event_type, lm_slug: window.__lm_slug || (window.__lm_data && window.__lm_data.slug) || "", src: q.get("src") || "direct", utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") }, prospect_id: q.get("pid") || null, referrer: document.referrer || "" }, payload || {});
      if (navigator.sendBeacon) navigator.sendBeacon(BEACON, new Blob([JSON.stringify(body)], { type: "application/json" }));
      else fetch(BEACON, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
    } catch (_) {}
  }

  function storageKey(slug, suf) { return "ivan.assessment." + slug + "." + suf; }
  function loadAnswers(slug) { try { return JSON.parse(localStorage.getItem(storageKey(slug, "answers")) || "{}"); } catch (_) { return {}; } }
  function saveAnswers(slug, a) {
    try { localStorage.setItem(storageKey(slug, "answers"), JSON.stringify(a)); } catch (_) {}
    // Also encode to URL ?p=<base64> for shareable progress + ITP resilience
    try {
      var encoded = btoa(unescape(encodeURIComponent(JSON.stringify(a))));
      var url = new URL(location.href);
      url.searchParams.set("p", encoded);
      history.replaceState(null, "", url.toString());
    } catch (_) {}
  }
  function loadAnswersFromUrl() {
    try {
      var q = new URLSearchParams(location.search);
      var p = q.get("p");
      if (!p) return null;
      return JSON.parse(decodeURIComponent(escape(atob(p))));
    } catch (_) { return null; }
  }
  function loadEmail(slug) { try { return localStorage.getItem(storageKey(slug, "email")) || ""; } catch (_) { return ""; } }
  function saveEmail(slug, e) { try { localStorage.setItem(storageKey(slug, "email"), e); } catch (_) {} }
  function recoveryDismissed(slug) { try { return localStorage.getItem("lmc_dismissed_recovery_" + slug) === "1"; } catch (_) { return false; } }
  function dismissRecovery(slug) { try { localStorage.setItem("lmc_dismissed_recovery_" + slug, "1"); } catch (_) {} }

  function flattenQuestions(data) {
    // Build a linear question list across all categories; prepend persona classifier if present
    var qs = [];
    if (data.persona_selector) qs.push(Object.assign({ __persona: true, category_id: "__persona", category_name: "About you" }, data.persona_selector));
    (data.categories || []).forEach(function (cat) {
      (cat.questions || []).forEach(function (q) {
        qs.push(Object.assign({}, q, { category_id: cat.id || cat.name || "", category_name: cat.name || cat.id || "" }));
      });
    });
    return qs;
  }

  function computeResult(data, answers) {
    // Overall score: average of per-category averages, scaled to 0-100
    var perCategory = {};
    var personaAnswer = answers.__persona || null;
    (data.categories || []).forEach(function (cat) {
      var scores = [];
      (cat.questions || []).forEach(function (q) {
        var a = answers[q.id];
        if (a != null) {
          // Answer can be an index into q.answers (if provided) or a 1-5 likert value
          var val = null;
          if (q.answers && q.answers[a] && typeof q.answers[a].score === "number") val = q.answers[a].score;
          else if (typeof a === "number") val = a;
          else if (!isNaN(Number(a))) val = Number(a);
          if (val != null && !isNaN(val)) {
            var maxScore = q.max_score || 5;
            scores.push((val / maxScore) * 100);
          }
        }
      });
      if (scores.length) {
        perCategory[cat.id || cat.name] = {
          name: cat.name || cat.id,
          score: Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length),
          answered: scores.length,
          total: (cat.questions || []).length,
          // surface optional brief fields for the Operator's Brief 1-pager
          // Schema: cat.operator_brief = { headline_number, lever, talking_points[], proof_of_concept }
          headline_number: (cat.operator_brief && cat.operator_brief.headline_number) || null,
          lever: (cat.operator_brief && cat.operator_brief.lever) || cat.lever || null,
          talking_points: (cat.operator_brief && cat.operator_brief.talking_points) || cat.talking_points || null,
          proof_of_concept: (cat.operator_brief && cat.operator_brief.proof_of_concept) || cat.proof_of_concept || null
        };
      }
    });
    var vals = Object.values(perCategory).map(function (c) { return c.score; });
    var overall = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 0;

    // Tier
    var th = data.tier_thresholds || { low: 40, mid: 70 };
    var tier = overall <= th.low ? { name: "Critical", class: "low" } :
               overall <= th.mid ? { name: "Growth Stage", class: "medium" } :
               { name: "Optimized", class: "" };
    // Optional headline_number on the tier (computed or passed-through)
    if (data.tier_headline_numbers && data.tier_headline_numbers[tier.class]) {
      tier.headline_number = data.tier_headline_numbers[tier.class];
    }

    // Weakest category
    var weakest = null;
    var sortedCats = Object.entries(perCategory).sort(function (a, b) { return a[1].score - b[1].score; });
    if (sortedCats.length) {
      var w = sortedCats[0][1];
      weakest = {
        id: sortedCats[0][0],
        name: w.name,
        score: w.score,
        headline_number: w.headline_number,
        lever: w.lever,
        talking_points: w.talking_points,
        proof_of_concept: w.proof_of_concept
      };
    }

    // Resolve persona tag (string) for CTA matching
    var personaTag = null;
    if (typeof personaAnswer === "number" && data.persona_selector && data.persona_selector.answers) {
      personaTag = (data.persona_selector.answers[personaAnswer] || {}).tag || null;
    } else if (typeof personaAnswer === "string") {
      personaTag = personaAnswer;
    }

    return { overall: overall, tier: tier, per_category: perCategory, weakest: weakest, persona: personaAnswer, persona_tag: personaTag };
  }

  function pickRec(cat, score) {
    var recs = cat.recommendations || {};
    if (score <= 40) return recs.low || recs.critical || null;
    if (score <= 70) return recs.mid || recs.growth || null;
    return recs.high || recs.optimized || null;
  }

  // Sandboxed evaluator for CTA `when` expressions. Uses Function (not eval) with explicit args.
  function evalWhen(expr, ctx) {
    try {
      var fn = new Function("persona", "overall_score", "weakest_category",
        '"use strict"; return (' + String(expr) + ');');
      return !!fn(ctx.persona, ctx.overall_score, ctx.weakest_category);
    } catch (_) { return false; }
  }

  // Pick the matching CTA from data.ctas[] with `when` expressions; first match wins; last entry is fallback.
  function pickCta(data, res) {
    if (Array.isArray(data.ctas) && data.ctas.length) {
      var ctx = {
        persona: res.persona_tag,
        overall_score: res.overall,
        weakest_category: res.weakest && res.weakest.id
      };
      for (var i = 0; i < data.ctas.length; i++) {
        var c = data.ctas[i];
        if (!c) continue;
        if (c.when) {
          if (evalWhen(c.when, ctx)) return c;
        }
      }
      // No match — fallback = last entry (regardless of `when`)
      return data.ctas[data.ctas.length - 1];
    }
    if (data.cta && data.cta.url) return data.cta;
    return null;
  }


  function buildIntro(data, startTargetSelector, opts) {
    opts = opts || {};
    var intro = data.intro || {};
    var welcomeLine = intro.paragraph || (data.subtitle ? "You just grabbed " + (data.title || "this resource") + ". " + String(data.subtitle).replace(/\.$/, "") + "." : "You just grabbed " + (data.title || "this resource") + ". Here's the quickest way to use it.");
    var pointA = intro.point_time || (data.estimated_minutes ? data.estimated_minutes + " min, at your pace" : "At your own pace");
    var pointB = intro.point_value || opts.defaultValueBullet || "Built to give you the sharpest observation on your team's gaps";
    var pointC = intro.point_next || opts.defaultNextBullet || "Your progress auto-saves to this browser. Email only if you want the full report.";
    var startLabel = (opts.startLabel || "Start");
    var note = intro.note || opts.defaultNote || "No signup required. Scroll back up anytime to reread.";
    var sec = make("section", { class: "lmc-intro", "aria-labelledby": "lmc-intro-h" });
    var inner = make("div", { class: "lmc-intro-inner" });
    var img = make("img", { class: "lmc-intro-avatar", src: "https://ivanmanfredi.com/ivan-portrait.jpg", alt: "Ivan Manfredi" });
    var body = make("div", { class: "lmc-intro-body" });
    body.appendChild(make("div", { class: "lmc-intro-badge" }, "Welcome"));
    body.appendChild(make("h2", { class: "lmc-intro-h", id: "lmc-intro-h" }, "Hey, I&rsquo;m Ivan."));
    body.appendChild(make("p", { class: "lmc-intro-p" }, escapeHtml(welcomeLine)));
    var ul = make("ul", { class: "lmc-intro-points" });
    [["a", "\u23F1", pointA], ["b", "\u2192", pointB], ["c", "\u2713", pointC]].forEach(function (p) {
      var li = make("li");
      li.appendChild(make("span", { class: "lmc-intro-icon " + p[0], "aria-hidden": "true" }, p[1]));
      li.appendChild(make("span", null, escapeHtml(p[2])));
      ul.appendChild(li);
    });
    body.appendChild(ul);
    var startBtn = make("button", { class: "lmc-intro-start", type: "button", "aria-label": startLabel }, escapeHtml(startLabel) + " <span aria-hidden=\"true\">\u2193</span>");
    startBtn.addEventListener("click", function () {
      var target = document.querySelector(startTargetSelector);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      beacon("cta_click", { answers: { target: "intro_start" } });
    });
    body.appendChild(startBtn);
    if (note) body.appendChild(make("p", { class: "lmc-intro-note" }, escapeHtml(note)));
    inner.appendChild(img);
    inner.appendChild(body);
    sec.appendChild(inner);
    return sec;
  }

  // Build a small "Hey, I'm Ivan" 1/3-column bio block (demoted from co-equal hero card)
  function buildIvanColumn() {
    var col = make("aside", { class: "lmc-ivan-col", "aria-label": "About Ivan" });
    var img = make("img", { class: "lmc-ivan-portrait", src: "https://ivanmanfredi.com/ivan-portrait.jpg", alt: "Ivan Manfredi" });
    col.appendChild(img);
    var bioText = (data.ivan_bio) || "I'm Ivan. I build Agent-Ready Ops systems for boutique knowledge-service firms. Honest answers in, honest scorecard out. No pitch on this page.";
    var p = make("p", { class: "lmc-ivan-bio" }, bioText);
    col.appendChild(p);
    var more = make("a", { class: "lmc-ivan-link", href: "https://ivanmanfredi.com", target: "_blank", rel: "noopener" }, "more about Ivan \u2192");
    col.appendChild(more);
    return col;
  }

  // Vertical → person-count band map (placeholder until lm_events backs this)
  function inferCountBand(vertical) {
    var v = String(vertical || "").toLowerCase();
    if (v.indexOf("account") !== -1 || v.indexOf("cpa") !== -1) return "20-80";
    if (v.indexOf("agency") !== -1 || v.indexOf("agencies") !== -1) return "11-50";
    if (v.indexOf("law") !== -1 || v.indexOf("legal") !== -1) return "10-40";
    if (v.indexOf("consult") !== -1) return "8-30";
    if (v.indexOf("saas") !== -1 || v.indexOf("software") !== -1) return "20-100";
    return "10-50";
  }

  // Build the credential bar above the hero headline
  function buildCredentialBar(data) {
    var aud = data.audience || {};
    var vertical = aud.vertical || aud.verticals || data.vertical || "operator-led";
    if (Array.isArray(vertical)) vertical = vertical.join(" / ");
    var locations = aud.locations || aud.location || data.locations || "the US, UK, and Canada";
    if (Array.isArray(locations)) locations = locations.join(", ");
    var band = aud.count_band || inferCountBand(vertical);
    var txt = "Used by " + band + "-person " + vertical + " firms in " + locations;
    return make("div", { class: "lmc-credential-bar" }, esc(txt));
  }

  // Build a static sample-output preview tile for the hero
  function buildSampleTile(data) {
    var tile = make("div", { class: "lmc-sample-tile", "aria-label": "Sample result preview" });
    var label = make("div", { class: "lmc-sample-label" }, "Sample result");
    var body = make("div", { class: "lmc-sample-body" });
    body.innerHTML =
      '<div class="lmc-sample-row">' +
        '<span class="lmc-sample-num"><em>58</em><span>/100</span></span>' +
        '<span class="lmc-sample-tag">Capacity Score</span>' +
      '</div>' +
      '<div class="lmc-sample-leak">Top leak: client intake (~11 hrs/week recoverable)</div>';
    tile.appendChild(label);
    tile.appendChild(body);
    return tile;
  }

  // Build a hero meta chip whose numeral is rendered in DM Serif italic + sage
  function buildMetaChip(numeral, unit) {
    var chip = make("div", { class: "lmc-meta-chip lmc-meta-chip-numeral" });
    chip.innerHTML = '<em class="lmc-meta-num">' + esc(String(numeral)) + '</em>' +
                     '<span class="lmc-meta-unit">' + esc(String(unit)) + '</span>';
    return chip;
  }

  // Open the Operator's Brief 1-pager in a new window (printable HTML)
  function openOperatorsBrief(data, res) {
    var w = res.weakest || {};
    var headline = (res.tier && res.tier.headline_number) || (res.overall + "/100");
    var lever = w.lever || "[brief content not generated for this assessment . regenerate via the LM workflow]";
    var tps = (w.talking_points && w.talking_points.length === 3)
      ? w.talking_points
      : ["[brief content not generated for this assessment . regenerate via the LM workflow]",
         "[brief content not generated for this assessment . regenerate via the LM workflow]",
         "[brief content not generated for this assessment . regenerate via the LM workflow]"];
    var poc = w.proof_of_concept || "[brief content not generated for this assessment . regenerate via the LM workflow]";
    var title = (data.title || "Assessment") + " Operator's Brief";

    var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<title>' + esc(title) + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Space+Grotesk:wght@400;500;700;900&display=swap" rel="stylesheet">' +
      '<style>' +
        '@page { margin: 0.6in; }' +
        'body { font-family: "Space Grotesk", sans-serif; color: #1A1A1A; background: #F7F4EF; padding: 2.5rem; max-width: 740px; margin: 0 auto; line-height: 1.5; }' +
        'h1 { font-size: 1.4rem; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 .25rem; }' +
        '.eyebrow { font-size: .7rem; letter-spacing: .15em; text-transform: uppercase; color: #4C6E3D; font-weight: 700; margin-bottom: 1rem; }' +
        '.headline-row { display: flex; align-items: baseline; gap: 1rem; padding: 1.5rem 0; border-top: 4px solid #1A1A1A; border-bottom: 1px solid rgba(26,26,26,0.15); margin-bottom: 1.5rem; }' +
        '.headline-num { font-family: "DM Serif Display", serif; font-style: italic; font-size: 96px; line-height: 1; color: #2A8F65; padding-left: 1rem; border-left: 4px solid #2A8F65; }' +
        '.headline-cap { font-size: .85rem; text-transform: uppercase; letter-spacing: .12em; font-weight: 700; color: #555; }' +
        'h2 { font-size: .85rem; text-transform: uppercase; letter-spacing: .12em; margin: 1.5rem 0 .5rem; color: #4C6E3D; }' +
        '.lever { font-size: 1.25rem; font-weight: 700; line-height: 1.35; }' +
        'ol { padding-left: 1.25rem; margin: 0; }' +
        'ol li { margin-bottom: .5rem; }' +
        '.poc { background: #fff; border: 1px solid rgba(26,26,26,0.15); padding: 1rem 1.25rem; border-left: 4px solid #2A8F65; margin-top: .5rem; }' +
        '.footer { margin-top: 2rem; font-size: .75rem; color: #555; border-top: 1px solid rgba(26,26,26,0.15); padding-top: .75rem; display: flex; justify-content: space-between; }' +
        '@media print { body { background: #fff; } }' +
      '</style></head><body>' +
      '<div class="eyebrow">Ivan Manfredi \u00B7 ' + esc(data.title || "Assessment") + '</div>' +
      '<h1>Operator\u2019s Brief</h1>' +
      '<div class="headline-row">' +
        '<span class="headline-num">' + esc(String(headline)) + '</span>' +
        '<span class="headline-cap">Bring this number to leadership</span>' +
      '</div>' +
      '<h2>The named lever</h2>' +
      '<p class="lever">' + esc(lever) + '</p>' +
      '<h2>3 talking points for leadership</h2>' +
      '<ol>' + tps.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join("") + '</ol>' +
      '<h2>1-week proof of concept</h2>' +
      '<div class="poc">' + esc(poc) + '</div>' +
      '<div class="footer"><span>Run before requesting budget.</span><span>ivanmanfredi.com</span></div>' +
      '<script>setTimeout(function(){try{window.print();}catch(e){}}, 400);<\/script>' +
      '</body></html>';

    var win = window.open("", "_blank");
    if (!win) { toast("Pop-up blocked. Allow pop-ups to open the brief"); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    root.innerHTML = "";

    var questions = flattenQuestions(data);
    // Hydrate answers: prefer URL ?p= then localStorage; merge with localStorage taking precedence on conflict
    var answers = loadAnswers(data.slug);
    var urlAnswers = loadAnswersFromUrl();
    if (urlAnswers && typeof urlAnswers === "object") {
      // Only adopt URL answers for keys not already in localStorage
      Object.keys(urlAnswers).forEach(function (k) {
        if (answers[k] == null) answers[k] = urlAnswers[k];
      });
      // Persist merged state immediately so URL stays in sync
      saveAnswers(data.slug, answers);
    }
    var idx = 0;
    // Resume from last unanswered question
    for (var i = 0; i < questions.length; i++) {
      if (answers[questions[i].id || "__persona"] == null) { idx = i; break; }
      idx = i + 1;
    }
    var captured = !!loadEmail(data.slug);

    // ── Hero (2-column: 2/3 headline + CTA, 1/3 Ivan bio) ───────────
    var hero = make("section", { class: "lmc-hero" });
    var hi = make("div", { class: "lmc-container lmc-hero-grid" });
    var heroMain = make("div", { class: "lmc-hero-main" });

    // Credential bar (small caps eyebrow above headline)
    heroMain.appendChild(buildCredentialBar(data));

    heroMain.appendChild(make("div", { class: "lmc-badge" }, esc(data.brand && data.brand.hero_badge || "Interactive Assessment")));
    heroMain.appendChild(make("h1", { class: "lmc-h1" }, esc(data.title || "Assessment")));
    if (data.subtitle) heroMain.appendChild(make("p", { class: "lmc-sub" }, esc(data.subtitle)));

    // Hero meta with italic-numeral chips
    var meta = make("div", { class: "lmc-meta" });
    meta.appendChild(buildMetaChip(questions.length, "questions"));
    if (data.estimated_minutes) meta.appendChild(buildMetaChip(data.estimated_minutes, "min"));
    var freeChip = make("div", { class: "lmc-meta-chip" }, "Auto-saves \u00B7 free");
    meta.appendChild(freeChip);
    heroMain.appendChild(meta);

    // Sample-output preview tile, then the big "Start the assessment" CTA — both inside the headline column
    heroMain.appendChild(buildSampleTile(data));
    var heroStartBtn = make("button", { class: "lmc-btn lmc-hero-start", type: "button" }, "Start the assessment \u2193");
    heroStartBtn.addEventListener("click", function () {
      var t = document.querySelector(".lmc-widget");
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      beacon("cta_click", { answers: { target: "hero_start" } });
    });
    heroMain.appendChild(heroStartBtn);

    hi.appendChild(heroMain);
    hi.appendChild(buildIvanColumn());
    hero.appendChild(hi);
    root.appendChild(hero);

    // Widget area
    var widget = make("div", { class: "lmc-widget" });
    var card = make("div", { class: "lmc-card", id: "lmc-card" });
    widget.appendChild(card);
    root.appendChild(widget);

    function maybeRenderRecoveryPrompt(parentEl) {
      // Mid-form email recovery: render once, at q index >= 8 OR >= 50% through, only if no email yet & not dismissed
      if (captured) return;
      if (loadEmail(data.slug)) return;
      if (recoveryDismissed(data.slug)) return;
      var threshold = Math.min(8, Math.floor(questions.length / 2));
      if (idx < threshold) return;
      var box = make("div", { class: "lmc-recovery", role: "region", "aria-label": "Save your progress" });
      box.innerHTML =
        '<div class="lmc-recovery-row">' +
          '<p class="lmc-recovery-text">Save your progress to your inbox? You\'ll get the same scorecard at the end either way.</p>' +
          '<button class="lmc-recovery-dismiss" type="button" aria-label="Dismiss">\u00D7</button>' +
        '</div>' +
        '<form class="lmc-recovery-form">' +
          '<label class="sr-only" for="lmc-recovery-email">Email</label>' +
          '<input class="lmc-recovery-input" id="lmc-recovery-email" type="email" autocomplete="email" placeholder="you@company.com" required>' +
          '<button class="lmc-btn lmc-recovery-save" type="submit">Save</button>' +
        '</form>';
      parentEl.appendChild(box);
      box.querySelector(".lmc-recovery-dismiss").addEventListener("click", function () {
        dismissRecovery(data.slug);
        if (box.parentNode) box.parentNode.removeChild(box);
      });
      box.querySelector(".lmc-recovery-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var em = (box.querySelector(".lmc-recovery-input") || {}).value || "";
        if (!em || em.indexOf("@") === -1) { toast("Enter a valid email"); return; }
        saveEmail(data.slug, em);
        beacon("partial_progress", { email: em, q_index: idx, total: questions.length });
        toast("Saved. We\u2019ll email your scorecard");
        dismissRecovery(data.slug);
        if (box.parentNode) box.parentNode.removeChild(box);
      });
    }

    function renderQuestion() {
      if (idx >= questions.length) { renderResult(); return; }
      card.innerHTML = "";
      var q = questions[idx];
      if (!q) { renderResult(); return; }
      // Progress
      var prog = make("div", { class: "lmc-progress-row" });
      var pct = Math.round((idx / questions.length) * 100);
      prog.innerHTML = '<span>Question <strong>' + (idx + 1) + '</strong> of ' + questions.length + '</span><div class="lmc-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + questions.length + '" aria-valuenow="' + idx + '"><div class="lmc-progress-fill" style="width:' + pct + '%"></div></div><span>' + pct + '%</span>';
      card.appendChild(prog);

      // Mid-form email recovery (rendered above the question text per spec)
      maybeRenderRecoveryPrompt(card);

      if (q.category_name) card.appendChild(make("div", { class: "lmc-category" }, esc(q.category_name)));
      card.appendChild(make("h2", { class: "lmc-question", id: "lmc-question-" + idx, tabindex: "-1" }, esc(q.text || q.label || "")));

      var options = q.answers || [];
      // If no answers array, default to 1-5 Likert
      if (!options.length) {
        options = [
          { label: "1 — Strongly disagree", score: 1 },
          { label: "2 — Disagree", score: 2 },
          { label: "3 — Neutral", score: 3 },
          { label: "4 — Agree", score: 4 },
          { label: "5 — Strongly agree", score: 5 }
        ];
      }

      var ul = make("ul", { class: "lmc-options", role: "radiogroup", "aria-labelledby": "lmc-question-" + idx });
      var optRefs = [];
      options.forEach(function (opt, ix) {
        var li = make("li");
        var inputId = "lmc-q" + idx + "-opt" + ix;
        var checked = (answers[q.id || "__persona"] === ix);
        var label = make("label", { class: "lmc-opt" + (checked ? " selected" : ""), for: inputId, role: "radio", "aria-checked": checked ? "true" : "false", tabindex: checked || (ix === 0 && answers[q.id || "__persona"] == null) ? "0" : "-1" });
        var input = make("input", { type: "radio", name: "q" + idx, id: inputId, value: String(ix) });
        if (checked) input.setAttribute("checked", "checked");
        label.appendChild(input);
        label.appendChild(make("span", null, esc(opt.label || opt.text || String(opt))));
        ul.appendChild(li);
        li.appendChild(label);
        optRefs.push(label);

        function selectOption() {
          answers[q.id || "__persona"] = ix;
          if (opt.tag) answers[(q.id || "__persona") + "__tag"] = opt.tag;
          saveAnswers(data.slug, answers);
          // Update aria-checked on all siblings
          optRefs.forEach(function (lab, j) {
            var isMe = (j === ix);
            lab.classList.toggle("selected", isMe);
            lab.setAttribute("aria-checked", isMe ? "true" : "false");
            lab.setAttribute("tabindex", isMe ? "0" : "-1");
          });
          setTimeout(function () { goNext(); }, 200);
        }
        label.addEventListener("click", function (e) {
          // Prevent double-fire from native radio
          e.preventDefault();
          selectOption();
        });
        label.addEventListener("keydown", function (e) {
          var key = e.key;
          if (key === " " || key === "Enter") { e.preventDefault(); selectOption(); return; }
          if (key === "ArrowDown" || key === "ArrowRight") {
            e.preventDefault();
            var nextIx = (ix + 1) % optRefs.length;
            optRefs[nextIx].focus();
            return;
          }
          if (key === "ArrowUp" || key === "ArrowLeft") {
            e.preventDefault();
            var prevIx = (ix - 1 + optRefs.length) % optRefs.length;
            optRefs[prevIx].focus();
            return;
          }
        });
      });
      card.appendChild(ul);

      var nav = make("div", { class: "lmc-nav" });
      var back = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Back");
      function setDisabledA11y(btn, disabled) {
        if (disabled) {
          btn.setAttribute("aria-disabled", "true");
          btn.style.opacity = "0.4";
          btn.style.pointerEvents = "none";
        } else {
          btn.removeAttribute("aria-disabled");
          btn.style.opacity = "";
          btn.style.pointerEvents = "";
        }
      }
      setDisabledA11y(back, idx === 0);
      back.addEventListener("click", function () { if (idx > 0) { idx--; renderQuestion(); } });
      var next = make("button", { class: "lmc-btn", type: "button", id: "lmc-next" }, idx === questions.length - 1 ? "See result →" : "Next →");
      setDisabledA11y(next, answers[q.id || "__persona"] == null);
      next.addEventListener("click", function () {
        if (next.getAttribute("aria-disabled") === "true") return;
        goNext();
      });
      nav.appendChild(back); nav.appendChild(next);
      card.appendChild(nav);

      // Focus management
      setTimeout(function () { var h = $("#lmc-question-" + idx); if (h) h.focus(); }, 10);
    }

    function goNext() {
      var q = questions[idx];
      if (answers[q.id || "__persona"] == null) return;
      if (idx < questions.length - 1) { idx++; renderQuestion(); }
      else renderResult();
    }

    function renderResult() {
      var res = computeResult(data, answers);
      card.innerHTML = "";

      // ── Result header with italic numeral signature ────────────────
      var headerBlock = make("div", { class: "lmc-result-header" });
      headerBlock.innerHTML =
        '<div class="lmc-result-header-row">' +
          '<span class="lmc-result-num">' + res.overall + '</span>' +
          '<div class="lmc-result-header-meta">' +
            '<span class="lmc-result-cap">Your score</span>' +
            '<span class="lmc-result-tier-name">' + esc(res.tier.name || "") + '</span>' +
          '</div>' +
        '</div>';
      card.appendChild(headerBlock);

      // ── Tier card (shared component) ───────────────────────────────
      var tierKey = res.tier.class === "low" ? "critical"
                   : res.tier.class === "medium" ? "growth"
                   : "optimized";
      var tierNote = res.weakest
        ? "Your weakest area is " + res.weakest.name + " (" + res.weakest.score + "/100). That's where the biggest leak usually lives."
        : "Your overall score tells the story; the category breakdown points to the specific fix.";
      var tierBlock = make("div", { class: "lmc-tier lmc-tier-" + tierKey });
      tierBlock.innerHTML =
        '<div class="lmc-tier-head">' +
          '<span class="lmc-tier-label">' + esc(res.tier.name || "Tier") + '</span>' +
          '<span class="lmc-tier-score"><em>' + res.overall + '</em><span>/100</span></span>' +
        '</div>' +
        '<p class="lmc-tier-note">' + esc(tierNote) + '</p>';
      card.appendChild(tierBlock);

      // ── Top-3 gap questions (the 3 lowest-scoring answered items) ───
      var gaps = [];
      (data.categories || []).forEach(function (cat) {
        (cat.questions || []).forEach(function (q) {
          var a = answers[q.id];
          if (a == null) return;
          var val = null;
          if (q.answers && q.answers[a] && typeof q.answers[a].score === "number") val = q.answers[a].score;
          else if (typeof a === "number") val = a;
          else if (!isNaN(Number(a))) val = Number(a);
          if (val == null || isNaN(val)) return;
          var maxScore = q.max_score || 5;
          var pct = val / maxScore;
          var rec = pickRec(cat, Math.round(pct * 100));
          var firstFix = null;
          if (rec && Array.isArray(rec.fixes) && rec.fixes.length) firstFix = rec.fixes[0];
          else if (rec && typeof rec === "string") firstFix = rec;
          else if (q.answers && q.answers[a] && q.answers[a].feedback) firstFix = q.answers[a].feedback;
          gaps.push({
            question: q.text || q.label || "",
            category: cat.name || cat.id,
            score: pct,
            gapScore: (1 - pct),
            fix: firstFix
          });
        });
      });
      gaps.sort(function (a, b) { return b.gapScore - a.gapScore; });
      var topGaps = gaps.filter(function (g) { return g.gapScore > 0.2; }).slice(0, 3);
      if (topGaps.length) {
        var h = make("h3", { class: "lmc-results-h" });
        h.innerHTML = "Top " + topGaps.length + " gap" + (topGaps.length === 1 ? "" : "s") + " to close <em>this week</em>";
        card.appendChild(h);

        var list = make("ol", { class: "lmc-gap-list" });
        list.innerHTML = topGaps.map(function (g, i) {
          return '<li class="lmc-gap">' +
            '<div class="lmc-gap-rank">' + (i + 1) + '</div>' +
            '<div class="lmc-gap-body">' +
              '<div class="lmc-gap-head"><span class="lmc-gap-text">' + esc(g.question) + '</span></div>' +
              (g.fix ? '<div class="lmc-gap-fix"><span class="lmc-gap-fix-label">Fix</span>' + esc(g.fix) + '</div>' : '') +
            '</div>' +
          '</li>';
        }).join("");
        card.appendChild(list);

        // "What to do Monday" — top-gap fix, or the fallback weakest-cat rec
        var mondayTxt = (topGaps[0] && topGaps[0].fix) || tierNote;
        var nm = make("p", { class: "lmc-next-move" });
        nm.innerHTML = '<span class="lmc-next-label">What to do Monday</span>' + esc(mondayTxt);
        card.appendChild(nm);
      }

      if (!captured) {
        var gate = make("div", { class: "lmc-capture", id: "lmc-capture" });
        gate.innerHTML =
          '<h3>Unlock your full report</h3>' +
          '<p>Enter your email and we\'ll reveal your per-category breakdown, personalized recommendations, and the 3 fixes I\'d prioritize based on your weakest category.</p>' +
          '<form class="lmc-form" id="lmc-capture-form">' +
          '<label class="sr-only" for="lmc-email">Email</label>' +
          '<input class="lmc-form-input" id="lmc-email" type="email" autocomplete="email" required placeholder="you@company.com" />' +
          '<button class="lmc-btn" type="submit">Unlock report</button>' +
          '</form>' +
          '<p class="lmc-note">No spam. One email with your report, then you decide.</p>';
        card.appendChild(gate);
        var form = $("#lmc-capture-form");
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var em = ($("#lmc-email") || {}).value || "";
          if (!em || em.indexOf("@") === -1) { toast("Enter a valid email"); return; }
          saveEmail(data.slug, em);
          captured = true;
          beacon("complete", {
            email: em,
            overall_score: res.overall,
            tier: res.tier.name,
            per_category: res.per_category,
            weakest_category: res.weakest && res.weakest.id,
            persona: res.persona_tag,
            answers: answers
          });
          renderUnlocked(res);
        });
      } else {
        // Already captured on this device
        renderUnlocked(res);
      }
    }

    function renderUnlocked(res) {
      // Remove any gate
      var gate = $("#lmc-capture"); if (gate) gate.parentNode.removeChild(gate);
      var unl = make("div", { class: "lmc-unlocked" });
      unl.appendChild(make("h3", { style: "font-size:1.5rem;font-weight:900;text-transform:uppercase;margin:1rem 0 0.5rem;" }, "Per-Category Breakdown"));

      (data.categories || []).forEach(function (cat) {
        var key = cat.id || cat.name;
        var catRes = res.per_category[key];
        if (!catRes) return;
        var block = make("div", { class: "lmc-category-block" });
        block.appendChild(make("h4", null, esc(cat.name || cat.id)));
        var bar = make("div", { class: "lmc-cat-bar" });
        bar.innerHTML = '<div class="lmc-cat-track"><div class="lmc-cat-fill" style="width:' + catRes.score + '%"></div></div><span class="lmc-cat-pct">' + catRes.score + '/100</span>';
        block.appendChild(bar);
        var rec = pickRec(cat, catRes.score);
        if (rec) {
          var rc = make("div", { class: "lmc-rec" });
          var tag = "Next step";
          if (catRes.score <= 40) tag = "Critical — fix first";
          else if (catRes.score <= 70) tag = "Growth unlock";
          else tag = "Keep sharpening";
          var text = typeof rec === "string" ? rec : (rec.text || rec.headline || "");
          var steps = (typeof rec === "object" && rec.steps) ? rec.steps : null;
          rc.innerHTML = '<strong>' + esc(tag) + '</strong>' + esc(text) + (steps ? '<ul>' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join("") + '</ul>' : "");
          block.appendChild(rc);
        }
        unl.appendChild(block);
      });

      // ── Operator's Brief 1-pager download button ───────────────────
      var briefRow = make("div", { class: "lmc-brief-row" });
      var briefBtn = make("button", { class: "lmc-btn lmc-btn-secondary lmc-brief-btn", type: "button" }, "Download the 1-page Brief for your team");
      briefBtn.addEventListener("click", function () {
        beacon("brief_download", { answers: { score: res.overall, tier: res.tier.name } });
        openOperatorsBrief(data, res);
      });
      briefRow.appendChild(briefBtn);
      unl.appendChild(briefRow);

      // Share row
      var share = make("div", { class: "lmc-share" });
      var shareText = "I scored " + res.overall + "/100 on Ivan Manfredi's " + (data.title || "assessment") + " (" + res.tier.name + (res.weakest ? "). Biggest gap: " + res.weakest.name : "") + ". Worth the 10 min:";
      var currentUrl = location.href.split("?")[0];
      var liUrl = "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(currentUrl) + "&summary=" + encodeURIComponent(shareText);
      var liBtn = make("a", { class: "lmc-btn", href: liUrl, target: "_blank", rel: "noopener" }, "Share on LinkedIn →");
      liBtn.addEventListener("click", function () { beacon("share", { answers: { target: "linkedin", score: res.overall } }); });
      share.appendChild(liBtn);
      var copy = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Copy result link");
      copy.addEventListener("click", function () {
        // Copy with progress payload so a colleague can resume from same point
        var shareUrl = location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(shareUrl).then(function () { toast("Link copied"); });
        beacon("share", { answers: { target: "copy_link", score: res.overall } });
      });
      share.appendChild(copy);
      var retake = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Retake");
      retake.addEventListener("click", function () {
        if (!confirm("Clear your answers and retake?")) return;
        try { localStorage.removeItem(storageKey(data.slug, "answers")); localStorage.removeItem(storageKey(data.slug, "email")); } catch (_) {}
        // Clean ?p= from URL
        try { var u = new URL(location.href); u.searchParams.delete("p"); history.replaceState(null, "", u.toString()); } catch (_) {}
        location.reload();
      });
      share.appendChild(retake);
      unl.appendChild(share);

      // ── Bottom CTA: data.ctas[] (with `when` matching) preferred; data.cta single is backward-compat ──
      var cta = pickCta(data, res);
      if (cta && cta.url) {
        var ctaBox = make("div", { style: "margin-top:2rem;padding:1.5rem;border:4px solid #000;background:#fff;box-shadow:8px 8px 0 #00E676;text-align:center;" });
        ctaBox.innerHTML = '<div style="font-size:1.25rem;font-weight:900;text-transform:uppercase;margin:0 0 .5rem;">' + esc(cta.headline || "Want help closing these gaps?") + '</div>' +
          '<p style="margin:0 0 1rem;">' + esc(cta.description || "Book a 20-min working session. Free, no pitch.") + '</p>' +
          '<a class="lmc-btn" href="' + esc(cta.url) + '" target="_blank" rel="noopener">' + esc(cta.button || "Book Strategy Call") + '</a>';
        unl.appendChild(ctaBox);
        ctaBox.querySelector("a").addEventListener("click", function () {
          beacon("cta_click", { answers: { score: res.overall, tier: res.tier.name, persona: res.persona_tag, cta_when: cta.when || null } });
        });
      }

      card.appendChild(unl);
    }

    renderQuestion();
    beacon("view", {});
  }

  function init() {
    var root = document.getElementById("lmc-root") || document.querySelector("[data-lm-assessment-src]");
    if (!root) return;
    var src = root.getAttribute("data-lm-assessment-src") || "./data.json";
    fetch(src, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("data.json " + r.status); return r.json(); }).then(function (data) { render(data, root); }).catch(function (e) {
      root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading assessment:</strong> ' + esc(e.message) + '</div>';
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
