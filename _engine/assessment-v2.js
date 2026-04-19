/* LM Assessment Engine v2 — mixed-type inputs (number / multi_select / short_text / likert) + computed personalized output
   Score = normalized per-question 0-100 → weighted average per category → average across categories
   Computed outputs (currency/hours/integer) run safeEval against the raw answer context
   Recommendations fire on `when` expressions referencing question ids + computed values */
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
  function fmt(spec, val) {
    if (val == null || isNaN(val)) return "—";
    var n = Number(val);
    if (spec === "currency") return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (spec === "percent") return n.toFixed(0) + "%";
    if (spec === "hours") return n.toFixed(n < 10 ? 1 : 0) + " hrs";
    if (spec === "integer") return Math.round(n).toLocaleString("en-US");
    if (spec === "decimal") return n.toFixed(2);
    return n.toLocaleString("en-US");
  }
  function safeEval(expr, ctx) {
    try {
      if (!expr) return null;
      if (!/^[\s0-9a-zA-Z_\.\+\-\*\/\%\(\)\?\:\,\<\>\=\!\&\|\[\]\'"\$]+$/.test(expr)) return null;
      var fn = new Function("ctx", "Math", "has", "countSel", "with (ctx) { return (" + expr + "); }");
      var v = fn(ctx, Math,
        function has(arr, tag) { return Array.isArray(arr) && arr.indexOf(tag) !== -1; },
        function countSel(arr) { return Array.isArray(arr) ? arr.length : 0; }
      );
      if (typeof v === "number" && isFinite(v)) return v;
      if (typeof v === "boolean") return v;
      return null;
    } catch (_) { return null; }
  }

  // --- Scoring normalizers per question type ---
  // Each question gets a normalized 0-100 score that drives category scoring.
  function normalizeAnswer(q, raw) {
    if (raw == null || raw === "") return null;
    if (q.type === "likert") {
      var max = q.max_score || 5;
      var v = typeof raw === "number" ? raw : Number(raw);
      if (isNaN(v)) return null;
      return Math.max(0, Math.min(100, (v / max) * 100));
    }
    if (q.type === "number") {
      // Use normalize_formula if provided; else default linear map from min..max to 0..100 (or reverse if invert)
      if (q.normalize_formula) return safeEval(q.normalize_formula, { x: Number(raw) });
      var mn = q.min || 0, mx = q.max || 100;
      var pct = ((Number(raw) - mn) / (mx - mn)) * 100;
      if (q.invert) pct = 100 - pct;
      return Math.max(0, Math.min(100, pct));
    }
    if (q.type === "multi_select") {
      // Score by sum of tag scores, normalized to max possible
      var selected = Array.isArray(raw) ? raw : [];
      var totalPossible = 0, got = 0;
      (q.answers || []).forEach(function (a) {
        var s = typeof a.score === "number" ? a.score : 0;
        if (s > 0) totalPossible += s;
        if (selected.indexOf(a.tag) !== -1) got += s;
      });
      if (totalPossible === 0) {
        // Fallback: score by presence-count against "good_tags" list
        var goodTags = q.good_tags || [];
        if (goodTags.length === 0) return selected.length > 0 ? 50 : 0;
        var hits = selected.filter(function (t) { return goodTags.indexOf(t) !== -1; }).length;
        return Math.min(100, (hits / goodTags.length) * 100);
      }
      return Math.max(0, Math.min(100, (got / totalPossible) * 100));
    }
    if (q.type === "short_text") {
      // Keyword match scoring: 3 tiers (manual/semi/automated) → 20/60/95
      var text = String(raw || "").toLowerCase();
      var kw = q.score_keywords || {};
      var best = 0;
      if (kw.automated && kw.automated.some(function (k) { return text.indexOf(k.toLowerCase()) !== -1; })) best = Math.max(best, 95);
      else if (kw.semi && kw.semi.some(function (k) { return text.indexOf(k.toLowerCase()) !== -1; })) best = Math.max(best, 60);
      else if (kw.manual && kw.manual.some(function (k) { return text.indexOf(k.toLowerCase()) !== -1; })) best = Math.max(best, 20);
      // No match = neutral 50
      return best || 50;
    }
    return null;
  }

  // --- Flatten questions with persona classifier prepended ---
  function flattenQuestions(data) {
    var qs = [];
    if (data.persona_selector) qs.push(Object.assign({ __persona: true, category_id: "__persona", category_name: "About you", type: "likert_picker" }, data.persona_selector));
    (data.categories || []).forEach(function (cat) {
      (cat.questions || []).forEach(function (q) {
        qs.push(Object.assign({}, q, { category_id: cat.id || cat.name || "", category_name: cat.name || cat.id || "" }));
      });
    });
    return qs;
  }

  function computeResult(data, answers) {
    // Build a context: each q_id → raw answer, each q_id_score → normalized 0-100
    var ctx = {};
    (data.categories || []).forEach(function (cat) {
      (cat.questions || []).forEach(function (q) {
        ctx[q.id] = answers[q.id];
        var norm = normalizeAnswer(q, answers[q.id]);
        ctx[q.id + "_score"] = norm;
      });
    });
    // persona
    if (data.persona_selector) {
      var pAns = answers["__persona"];
      if (typeof pAns === "number" && data.persona_selector.answers && data.persona_selector.answers[pAns]) {
        ctx.persona = data.persona_selector.answers[pAns].tag || null;
      }
    }

    // Per-category scoring
    var perCategory = {};
    (data.categories || []).forEach(function (cat) {
      var key = cat.id || cat.name;
      if (cat.scoring_formula) {
        var v = safeEval(cat.scoring_formula, ctx);
        if (v != null) {
          perCategory[key] = { name: cat.name || cat.id, score: Math.round(v), answered: (cat.questions || []).length, total: (cat.questions || []).length };
        }
      } else {
        // Default: weighted avg of question _score values
        var total = 0, weight = 0;
        (cat.questions || []).forEach(function (q) {
          var s = ctx[q.id + "_score"];
          if (s == null) return;
          var w = q.weight || 1;
          total += s * w;
          weight += w;
        });
        if (weight > 0) {
          perCategory[key] = { name: cat.name || cat.id, score: Math.round(total / weight), answered: (cat.questions || []).length, total: (cat.questions || []).length };
        }
      }
    });

    // Overall
    var overall;
    if (data.overall_scoring_formula) {
      overall = Math.round(safeEval(data.overall_scoring_formula, Object.assign({}, ctx, Object.fromEntries(Object.entries(perCategory).map(function (e) { return [e[0] + "_score", e[1].score]; })))) || 0);
    } else {
      var scores = Object.values(perCategory).map(function (c) { return c.score; });
      overall = scores.length ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) : 0;
    }

    // Tier
    var th = data.tier_thresholds || { low: 40, mid: 70 };
    var tier = overall <= th.low ? { name: th.low_label || "Critical", class: "low" }
             : overall <= th.mid ? { name: th.mid_label || "Growth Stage", class: "medium" }
             : { name: th.high_label || "Optimized", class: "" };

    // Weakest
    var sorted = Object.entries(perCategory).sort(function (a, b) { return a[1].score - b[1].score; });
    var weakest = sorted.length ? { id: sorted[0][0], name: sorted[0][1].name, score: sorted[0][1].score } : null;

    // Computed outputs (the $ leak, hrs lost, etc)
    var computed = {};
    (data.computed_outputs || []).forEach(function (co) {
      var v = safeEval(co.formula, Object.assign({}, ctx, { overall_score: overall, weakest_category: weakest && weakest.id }));
      computed[co.id] = { label: co.label, value: v, format: co.format, show: co.show_in_result !== false };
    });

    return { overall: overall, tier: tier, per_category: perCategory, weakest: weakest, persona: ctx.persona, ctx: ctx, computed: computed };
  }

  // --- Intro block (unchanged from v1) ---
  function buildIntro(data, startTargetSelector) {
    var welcomeLine = (data.intro && data.intro.paragraph) || (data.subtitle ? "You just grabbed " + (data.title || "this resource") + ". " + String(data.subtitle).replace(/\.$/, "") + "." : "You just grabbed " + (data.title || "this resource") + ".");
    var pointA = (data.intro && data.intro.point_time) || (data.estimated_minutes ? data.estimated_minutes + " min, at your pace" : "At your own pace");
    var pointB = (data.intro && data.intro.point_value) || "Honest inputs (not Likert vibes) so your output reflects your actual situation";
    var pointC = (data.intro && data.intro.point_next) || "Score + tier shown free. Email unlocks per-category breakdown + personalized fixes.";
    var sec = make("section", { class: "lmc-intro" });
    var inner = make("div", { class: "lmc-intro-inner" });
    inner.appendChild(make("img", { class: "lmc-intro-avatar", src: "https://ivanmanfredi.com/ivan-portrait.jpg", alt: "Ivan Manfredi" }));
    var body = make("div", { class: "lmc-intro-body" });
    body.appendChild(make("div", { class: "lmc-intro-badge" }, "Welcome"));
    body.appendChild(make("h2", { class: "lmc-intro-h" }, "Hey, I&rsquo;m Ivan."));
    body.appendChild(make("p", { class: "lmc-intro-p" }, esc(welcomeLine)));
    var ul = make("ul", { class: "lmc-intro-points" });
    [["a", "⏱", pointA], ["b", "→", pointB], ["c", "✓", pointC]].forEach(function (p) {
      var li = make("li");
      li.appendChild(make("span", { class: "lmc-intro-icon " + p[0] }, p[1]));
      li.appendChild(make("span", null, esc(p[2])));
      ul.appendChild(li);
    });
    body.appendChild(ul);
    var startBtn = make("button", { class: "lmc-intro-start", type: "button" }, "Start the assessment <span>&darr;</span>");
    startBtn.addEventListener("click", function () {
      var t = document.querySelector(startTargetSelector);
      if (t) t.scrollIntoView({ behavior: "smooth" });
      beacon("cta_click", { answers: { target: "intro_start" } });
    });
    body.appendChild(startBtn);
    inner.appendChild(body);
    sec.appendChild(inner);
    return sec;
  }

  // --- Render ---
  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    var key = "ivan.assessment." + data.slug;
    var questions = flattenQuestions(data);
    var answers = (function () { try { return JSON.parse(localStorage.getItem(key + ".answers") || "{}"); } catch (_) { return {}; } })();
    var idx = 0;
    for (var i = 0; i < questions.length; i++) {
      if (answers[questions[i].id || "__persona"] == null) { idx = i; break; }
      idx = i + 1;
    }
    var captured = !!localStorage.getItem(key + ".email");
    root.innerHTML = "";

    // Hero
    var hero = make("section", { class: "lmc-hero" });
    var hi = make("div", { class: "lmc-container" });
    hi.appendChild(make("div", { class: "lmc-badge" }, esc((data.brand && data.brand.hero_badge) || "Interactive Assessment")));
    hi.appendChild(make("h1", { class: "lmc-h1" }, esc(data.title || "Assessment")));
    if (data.subtitle) hi.appendChild(make("p", { class: "lmc-sub" }, esc(data.subtitle)));
    var meta = make("div", { class: "lmc-meta" });
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, questions.length + " questions"));
    if (data.estimated_minutes) meta.appendChild(make("div", { class: "lmc-meta-chip" }, data.estimated_minutes + " min"));
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, "Auto-saves"));
    hi.appendChild(meta);
    hero.appendChild(hi);
    root.appendChild(hero);

    root.appendChild(buildIntro(data, ".lmc-widget"));

    var widget = make("div", { class: "lmc-widget" });
    var card = make("div", { class: "lmc-card", id: "lmc-card" });
    widget.appendChild(card);
    root.appendChild(widget);

    function save() { try { localStorage.setItem(key + ".answers", JSON.stringify(answers)); } catch (_) {} }

    function renderQuestion() {
      if (idx >= questions.length) { renderResult(); return; }
      card.innerHTML = "";
      var q = questions[idx];
      if (!q) { renderResult(); return; }
      var pct = Math.round((idx / questions.length) * 100);
      var prog = make("div", { class: "lmc-progress-row" });
      prog.innerHTML = '<span>Question <strong>' + (idx + 1) + '</strong> of ' + questions.length + '</span><div class="lmc-progress-bar"><div class="lmc-progress-fill" style="width:' + pct + '%"></div></div><span>' + pct + '%</span>';
      card.appendChild(prog);
      if (q.category_name) card.appendChild(make("div", { class: "lmc-category" }, esc(q.category_name)));
      card.appendChild(make("h2", { class: "lmc-question", id: "lmc-q" + idx, tabindex: "-1" }, esc(q.text || q.label || "")));
      if (q.hint) card.appendChild(make("p", { class: "lmc-hint" }, esc(q.hint)));

      // Type-dispatched input
      if (q.type === "number") renderNumberInput(q);
      else if (q.type === "multi_select") renderMultiSelect(q);
      else if (q.type === "short_text") renderShortText(q);
      else renderLikert(q); // likert, likert_picker, or anything else defaults to radio list

      // Nav
      var nav = make("div", { class: "lmc-nav" });
      var back = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Back");
      if (idx === 0) back.setAttribute("disabled", "disabled");
      back.addEventListener("click", function () { if (idx > 0) { idx--; renderQuestion(); } });
      var nextLabel = idx === questions.length - 1 ? "See result →" : "Next →";
      var nextBtn = make("button", { class: "lmc-btn", type: "button", id: "lmc-next" }, nextLabel);
      if (!hasValidAnswer(q)) nextBtn.setAttribute("disabled", "disabled");
      nextBtn.addEventListener("click", goNext);
      nav.appendChild(back); nav.appendChild(nextBtn);
      card.appendChild(nav);
      setTimeout(function () { var h = $("#lmc-q" + idx); if (h) h.focus(); }, 10);
    }

    function hasValidAnswer(q) {
      var a = answers[q.id || "__persona"];
      if (q.type === "number") return a != null && a !== "" && !isNaN(Number(a));
      if (q.type === "multi_select") return Array.isArray(a) && a.length > 0;
      if (q.type === "short_text") return typeof a === "string" && a.trim().length > 0;
      return a != null;
    }

    function renderLikert(q) {
      var options = q.answers || [
        { label: "1 — Strongly disagree", score: 1 },
        { label: "2 — Disagree", score: 2 },
        { label: "3 — Neutral", score: 3 },
        { label: "4 — Agree", score: 4 },
        { label: "5 — Strongly agree", score: 5 }
      ];
      var ul = make("ul", { class: "lmc-options" });
      options.forEach(function (opt, ix) {
        var li = make("li");
        var checked = (answers[q.id || "__persona"] === ix);
        var label = make("label", { class: "lmc-opt" + (checked ? " selected" : ""), for: "lmc-q" + idx + "-o" + ix });
        var input = make("input", { type: "radio", name: "q" + idx, id: "lmc-q" + idx + "-o" + ix, value: String(ix) });
        if (checked) input.setAttribute("checked", "checked");
        label.appendChild(input);
        label.appendChild(make("span", null, esc(opt.label || opt.text || String(opt))));
        li.appendChild(label); ul.appendChild(li);
        label.addEventListener("click", function () {
          answers[q.id || "__persona"] = ix;
          save();
          setTimeout(function () { goNext(); }, 200);
        });
      });
      card.appendChild(ul);
    }

    function renderNumberInput(q) {
      var wrap = make("div", { class: "lmc-input-row" });
      if (q.prefix) wrap.appendChild(make("span", { class: "lmc-prefix" }, esc(q.prefix)));
      var input = make("input", { type: "number", class: "lmc-number", id: "lmc-q" + idx + "-n", inputmode: "decimal" });
      if (q.min != null) input.setAttribute("min", q.min);
      if (q.max != null) input.setAttribute("max", q.max);
      if (q.step != null) input.setAttribute("step", q.step);
      var current = answers[q.id];
      if (current != null) input.value = current;
      else if (q.default != null) input.value = q.default;
      input.addEventListener("input", function () {
        answers[q.id] = input.value === "" ? null : Number(input.value);
        save();
        var nb = $("#lmc-next"); if (nb) { if (hasValidAnswer(q)) nb.removeAttribute("disabled"); else nb.setAttribute("disabled", "disabled"); }
      });
      wrap.appendChild(input);
      if (q.suffix) wrap.appendChild(make("span", { class: "lmc-suffix" }, esc(q.suffix)));
      card.appendChild(wrap);
      setTimeout(function () { input.focus(); }, 50);
    }

    function renderMultiSelect(q) {
      var ul = make("ul", { class: "lmc-options lmc-multi" });
      var current = Array.isArray(answers[q.id]) ? answers[q.id].slice() : [];
      (q.answers || []).forEach(function (opt, ix) {
        var li = make("li");
        var selected = current.indexOf(opt.tag) !== -1;
        var label = make("label", { class: "lmc-opt lmc-opt-check" + (selected ? " selected" : ""), for: "lmc-q" + idx + "-c" + ix });
        var input = make("input", { type: "checkbox", id: "lmc-q" + idx + "-c" + ix, value: opt.tag });
        if (selected) input.setAttribute("checked", "checked");
        label.appendChild(input);
        label.appendChild(make("span", { class: "lmc-check-box" }, "&#10003;"));
        label.appendChild(make("span", { class: "lmc-check-text" }, esc(opt.label || opt.text)));
        li.appendChild(label); ul.appendChild(li);
        label.addEventListener("click", function (e) {
          e.preventDefault();
          var arr = Array.isArray(answers[q.id]) ? answers[q.id].slice() : [];
          var pos = arr.indexOf(opt.tag);
          if (pos === -1) arr.push(opt.tag); else arr.splice(pos, 1);
          answers[q.id] = arr;
          save();
          label.classList.toggle("selected", arr.indexOf(opt.tag) !== -1);
          input.checked = arr.indexOf(opt.tag) !== -1;
          var nb = $("#lmc-next"); if (nb) { if (hasValidAnswer(q)) nb.removeAttribute("disabled"); else nb.setAttribute("disabled", "disabled"); }
        });
      });
      card.appendChild(ul);
      if (q.multi_hint) card.appendChild(make("p", { class: "lmc-multi-hint" }, esc(q.multi_hint)));
      else card.appendChild(make("p", { class: "lmc-multi-hint" }, "Check all that apply."));
    }

    function renderShortText(q) {
      var ta = make("textarea", { class: "lmc-textarea", id: "lmc-q" + idx + "-t", rows: "3", placeholder: q.placeholder || "One sentence is fine." });
      var current = answers[q.id];
      if (typeof current === "string") ta.value = current;
      ta.addEventListener("input", function () {
        answers[q.id] = ta.value;
        save();
        var nb = $("#lmc-next"); if (nb) { if (hasValidAnswer(q)) nb.removeAttribute("disabled"); else nb.setAttribute("disabled", "disabled"); }
      });
      card.appendChild(ta);
      setTimeout(function () { ta.focus(); }, 50);
    }

    function goNext() {
      var q = questions[idx];
      if (!hasValidAnswer(q)) return;
      if (idx < questions.length - 1) { idx++; renderQuestion(); }
      else renderResult();
    }

    function renderResult() {
      var res = computeResult(data, answers);
      card.innerHTML = "";
      var wrap = make("div", { class: "lmc-result" });
      var circ = 2 * Math.PI * 70;
      var offset = circ - (res.overall / 100) * circ;
      wrap.innerHTML = '<div class="lmc-score-ring"><svg width="180" height="180" viewBox="0 0 180 180"><circle class="track" cx="90" cy="90" r="70"/><circle class="arc" cx="90" cy="90" r="70" stroke-dasharray="' + circ.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"/></svg><div class="score-num"><div class="num">' + res.overall + '</div><div class="suffix">out of 100</div></div></div>';
      wrap.appendChild(make("div", { class: "lmc-tier-pill " + (res.tier.class || "") }, esc(res.tier.name)));

      // Computed outputs rendered prominently (this is the $ leak / hrs lost)
      var visibleComputed = Object.values(res.computed).filter(function (co) { return co.show; });
      if (visibleComputed.length > 0) {
        var cb = make("div", { class: "lmc-computed-block" });
        visibleComputed.forEach(function (co) {
          var row = make("div", { class: "lmc-computed-row" });
          row.innerHTML = '<div class="lmc-computed-label">' + esc(co.label) + '</div><div class="lmc-computed-value">' + fmt(co.format, co.value) + '</div>';
          cb.appendChild(row);
        });
        wrap.appendChild(cb);
      }

      // Weakest-category headline sentence (uses real user inputs)
      if (res.weakest) {
        var headline = buildHeadline(data, res);
        wrap.appendChild(make("p", { class: "lmc-result-lead" }, headline));
      }
      card.appendChild(wrap);

      // No gate — show the full report unconditionally
      beacon("complete", {
        email: null,
        overall_score: res.overall,
        tier: res.tier.name,
        per_category: res.per_category,
        weakest_category: res.weakest && res.weakest.id,
        persona: res.persona,
        computed: Object.fromEntries(Object.entries(res.computed).map(function (e) { return [e[0], e[1].value]; })),
        answers: res.ctx
      });
      renderUnlocked(res);
    }

    function renderUnlocked(res) {
      var g = $("#lmc-capture"); if (g) g.parentNode.removeChild(g);
      var unl = make("div", { class: "lmc-unlocked" });
      unl.appendChild(make("h3", { style: "font-size:1.5rem;font-weight:900;text-transform:uppercase;margin:1.5rem 0 1rem;" }, "Your full report"));
      (data.categories || []).forEach(function (cat) {
        var key2 = cat.id || cat.name;
        var catRes = res.per_category[key2];
        if (!catRes) return;
        var block = make("div", { class: "lmc-category-block" });
        block.appendChild(make("h4", null, esc(cat.name || cat.id)));
        block.innerHTML += '<div class="lmc-cat-bar"><div class="lmc-cat-track"><div class="lmc-cat-fill" style="width:' + catRes.score + '%"></div></div><span class="lmc-cat-pct">' + catRes.score + '/100</span></div>';
        var rec = pickRec(cat, catRes.score, res.ctx);
        if (rec) {
          var rc = make("div", { class: "lmc-rec" });
          var tag = catRes.score <= 40 ? "Fix first" : catRes.score <= 70 ? "Next unlock" : "Keep sharpening";
          rc.innerHTML = '<strong>' + esc(tag) + '</strong>' + esc(rec.text || rec.headline || "") + (rec.steps ? '<ul>' + rec.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join("") + '</ul>' : "");
          block.appendChild(rc);
        }
        unl.appendChild(block);
      });
      // Share + retake
      var share = make("div", { class: "lmc-share" });
      var currentUrl = location.href.split("?")[0];
      var shareText = "I scored " + res.overall + "/100 on Ivan Manfredi's " + (data.title || "assessment") + " (" + res.tier.name + (res.weakest ? "). Biggest gap: " + res.weakest.name : "") + ". Worth the time:";
      var liUrl = "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(currentUrl) + "&summary=" + encodeURIComponent(shareText);
      var liBtn = make("a", { class: "lmc-btn", href: liUrl, target: "_blank", rel: "noopener" }, "Share on LinkedIn →");
      liBtn.addEventListener("click", function () { beacon("share", { answers: { target: "linkedin", score: res.overall } }); });
      share.appendChild(liBtn);
      var copy = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Copy link");
      copy.addEventListener("click", function () { if (navigator.clipboard) navigator.clipboard.writeText(currentUrl).then(function () { toast("Link copied"); }); beacon("share", { answers: { target: "copy_link" } }); });
      share.appendChild(copy);
      var retake = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Retake");
      retake.addEventListener("click", function () {
        if (!confirm("Clear answers and retake?")) return;
        try { localStorage.removeItem(key + ".answers"); localStorage.removeItem(key + ".email"); } catch (_) {}
        location.reload();
      });
      share.appendChild(retake);
      unl.appendChild(share);
      // Optional email opt-in — NOT a gate. Pure additive.
      var optin = make("div", { class: "lmc-optin" });
      optin.innerHTML =
        '<h4>Save this for later?</h4>' +
        '<p>If you want a PDF version of this report emailed to you, drop your address. Otherwise feel free to close the tab or bookmark the page.</p>' +
        '<form class="lmc-form" id="lmc-optin-form">' +
        '<input class="lmc-form-input" id="lmc-optin-email" type="email" autocomplete="email" placeholder="Optional — your email" />' +
        '<button class="lmc-btn lmc-btn-secondary" type="submit">Send me a copy</button>' +
        '</form>';
      unl.appendChild(optin);
      var of = optin.querySelector("form");
      of.addEventListener("submit", function (e) {
        e.preventDefault();
        var em = (optin.querySelector("#lmc-optin-email") || {}).value || "";
        if (!em || em.indexOf("@") === -1) { toast("Enter a valid email"); return; }
        try { localStorage.setItem(key + ".email", em); } catch (_) {}
        beacon("capture", {
          email: em,
          overall_score: res.overall,
          tier: res.tier.name,
          per_category: res.per_category,
          weakest_category: res.weakest && res.weakest.id,
          persona: res.persona,
          computed: Object.fromEntries(Object.entries(res.computed).map(function (e) { return [e[0], e[1].value]; })),
          answers: res.ctx
        });
        optin.innerHTML = '<h4>Sent.</h4><p>Look for "your ' + esc(data.title || "report") + '" in your inbox. If it doesn\'t show in 2 min, check Promotions or Spam.</p>';
      });

      if (data.cta && data.cta.url) {
        var cta = make("div", { class: "lmc-cta-box" });
        cta.innerHTML = '<h3>' + esc(data.cta.headline || "Want help closing these gaps?") + '</h3><p>' + esc(data.cta.description || "") + '</p><a class="lmc-btn" href="' + esc(data.cta.url) + '" target="_blank" rel="noopener">' + esc(data.cta.button || "Book Strategy Call") + '</a>';
        unl.appendChild(cta);
        cta.querySelector("a").addEventListener("click", function () { beacon("cta_click", { answers: { score: res.overall, tier: res.tier.name } }); });
      }
      card.appendChild(unl);
    }

    function pickRec(cat, score, ctx) {
      // Support both old recommendations object AND new dynamic recommendations with when expressions
      if (Array.isArray(cat.recommendations)) {
        // New format: array of {when, text, steps, headline}
        for (var i = 0; i < cat.recommendations.length; i++) {
          var r = cat.recommendations[i];
          if (r.when) { if (safeEval(r.when, ctx)) return r; }
          else if (r.if_score_below != null && score < r.if_score_below) return r;
          else if (r.if_score_above != null && score > r.if_score_above) return r;
        }
        return cat.recommendations[cat.recommendations.length - 1];
      }
      // Legacy object format
      var recs = cat.recommendations || {};
      if (score <= 40) return recs.low || recs.critical || null;
      if (score <= 70) return recs.mid || recs.growth || null;
      return recs.high || recs.optimized || null;
    }

    function buildHeadline(data, res) {
      if (data.headline_formula) {
        // Claude can template the headline: "You scored {overall}/100. With {door_count} doors..."
        var tpl = data.headline_formula;
        Object.keys(res.ctx || {}).forEach(function (k) {
          tpl = tpl.replace(new RegExp("\\{" + k + "\\}", "g"), res.ctx[k] != null ? String(res.ctx[k]) : "");
        });
        Object.entries(res.computed).forEach(function (e) {
          tpl = tpl.replace(new RegExp("\\{" + e[0] + "\\}", "g"), fmt(e[1].format, e[1].value));
        });
        if (res.weakest) {
          tpl = tpl.replace(/\{weakest_category_name\}/g, res.weakest.name);
          tpl = tpl.replace(/\{weakest_category_score\}/g, String(res.weakest.score));
        }
        return tpl;
      }
      return "Your weakest area is <strong>" + esc(res.weakest.name) + "</strong> (" + res.weakest.score + "/100). That's where the biggest hours-per-week leak usually lives.";
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
