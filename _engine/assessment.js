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
    // Edit mode active → no-op (mitigation #6)
    // Sync URL check catches the race where async token validation hasn't resolved yet
    try {
      if (new URLSearchParams(location.search).get("edit")) return;
      if (window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled()) return;
    } catch (_) {}
    try {
      var q = new URLSearchParams(location.search);
      var body = Object.assign({ event_type: event_type, lm_slug: window.__lm_slug || (window.__lm_data && window.__lm_data.slug) || "", src: q.get("src") || "direct", utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") }, prospect_id: q.get("pid") || null, referrer: document.referrer || "" }, payload || {});
      if (navigator.sendBeacon) navigator.sendBeacon(BEACON, new Blob([JSON.stringify(body)], { type: "application/json" }));
      else fetch(BEACON, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
    } catch (_) {}
  }

  function storageKey(slug, suf) { return "ivan.assessment." + slug + "." + suf; }
  function loadAnswers(slug) { try { return JSON.parse(localStorage.getItem(storageKey(slug, "answers")) || "{}"); } catch (_) { return {}; } }
  function saveAnswers(slug, a) { try { localStorage.setItem(storageKey(slug, "answers"), JSON.stringify(a)); } catch (_) {} }
  function loadEmail(slug) { try { return localStorage.getItem(storageKey(slug, "email")) || ""; } catch (_) { return ""; } }
  function saveEmail(slug, e) { try { localStorage.setItem(storageKey(slug, "email"), e); } catch (_) {} }

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
          total: (cat.questions || []).length
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

    // Weakest category
    var weakest = null;
    var sortedCats = Object.entries(perCategory).sort(function (a, b) { return a[1].score - b[1].score; });
    if (sortedCats.length) weakest = { id: sortedCats[0][0], name: sortedCats[0][1].name, score: sortedCats[0][1].score };

    return { overall: overall, tier: tier, per_category: perCategory, weakest: weakest, persona: personaAnswer };
  }

  function pickRec(cat, score) {
    var recs = cat.recommendations || {};
    if (score <= 40) return recs.low || recs.critical || null;
    if (score <= 70) return recs.mid || recs.growth || null;
    return recs.high || recs.optimized || null;
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
    var introPara = make("p", { class: "lmc-intro-p" }, escapeHtml(welcomeLine));
    if (window.LM && window.LM.editMode) {
      window.LM.editMode.registerField(introPara, "intro.paragraph", { multiline: true });
    }
    body.appendChild(introPara);
    var ul = make("ul", { class: "lmc-intro-points" });
    var introPointPaths = ["intro.point_time", "intro.point_value", "intro.point_next"];
    [["a", "\u23F1", pointA], ["b", "\u2192", pointB], ["c", "\u2713", pointC]].forEach(function (p, ix) {
      var li = make("li");
      li.appendChild(make("span", { class: "lmc-intro-icon " + p[0], "aria-hidden": "true" }, p[1]));
      var textSpan = make("span", null, escapeHtml(p[2]));
      if (window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(textSpan, introPointPaths[ix], { multiline: true });
      }
      li.appendChild(textSpan);
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
    // Reset link: only surfaced when there are saved answers. Lets the user
    // wipe localStorage progress without having to complete the gate flow.
    if (opts.hasProgress && opts.onReset) {
      var resetWrap = make("p", { class: "lmc-intro-reset" });
      var resetLink = make("button", { class: "lmc-intro-reset-btn", type: "button" }, "Reset progress");
      resetLink.addEventListener("click", function () {
        if (!confirm("Clear your saved answers and start over?")) return;
        opts.onReset();
      });
      resetWrap.appendChild(make("span", { class: "lmc-intro-reset-prefix" }, "Resuming where you left off. "));
      resetWrap.appendChild(resetLink);
      body.appendChild(resetWrap);
    }
    if (note) {
      var noteEl = make("p", { class: "lmc-intro-note" }, escapeHtml(note));
      if (window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(noteEl, "intro.note", { multiline: true });
      }
      body.appendChild(noteEl);
    }
    inner.appendChild(img);
    inner.appendChild(body);
    sec.appendChild(inner);
    return sec;
  }

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    window.__lm_format = "assessment";
    if (window.LM && window.LM.tracker) window.LM.tracker.touch(data);
    root.innerHTML = "";

    var questions = flattenQuestions(data);
    var answers = loadAnswers(data.slug);
    var idx = 0;
    // Resume from last unanswered question
    for (var i = 0; i < questions.length; i++) {
      if (answers[questions[i].id || "__persona"] == null) { idx = i; break; }
      idx = i + 1;
    }
    var captured = !!loadEmail(data.slug);

    // Hero
    var hero = make("section", { class: "lmc-hero" });
    var hi = make("div", { class: "lmc-container" });
    hi.appendChild(make("div", { class: "lmc-badge" }, esc(data.brand && data.brand.hero_badge || "Interactive Assessment")));
    var h1 = make("h1", { class: "lmc-h1" });
    h1.innerHTML = (window.LM && window.LM.italicizePivot) ? window.LM.italicizePivot(data.title || "Assessment") : esc(data.title || "Assessment");
    if (window.LM && window.LM.editMode) window.LM.editMode.registerField(h1, "title");
    hi.appendChild(h1);
    if (data.subtitle) {
      var sub = make("p", { class: "lmc-sub" }, esc(data.subtitle));
      if (window.LM && window.LM.editMode) window.LM.editMode.registerField(sub, "subtitle");
      hi.appendChild(sub);
    }
    var meta = make("div", { class: "lmc-meta" });
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, questions.length + " questions"));
    if (data.estimated_minutes) meta.appendChild(make("div", { class: "lmc-meta-chip" }, data.estimated_minutes + " min"));
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, "Auto-saves"));
    hi.appendChild(meta);
    hero.appendChild(hi);
    root.appendChild(hero);

    // Dynamic start label: resume if any answers were saved, start otherwise.
    var introHasProgress = Object.keys(answers).some(function (k) { return answers[k] != null; });
    var introSection = buildIntro(data, ".lmc-widget", {
      defaultValueBullet: "15-20 questions, 5 categories. Honest answers = honest result",
      defaultNextBullet: "Score + tier shown free. Email unlocks per-category breakdown + personalized fixes",
      startLabel: introHasProgress ? "Resume the assessment" : "Start the assessment",
      defaultNote: "No signup to take it. Results stay private until you unlock the full report.",
      hasProgress: introHasProgress,
      onReset: function () {
        try {
          localStorage.removeItem(storageKey(data.slug, "answers"));
          localStorage.removeItem(storageKey(data.slug, "email"));
        } catch (_) {}
        location.reload();
      }
    });
    root.appendChild(introSection);

    // Widget area
    var widget = make("div", { class: "lmc-widget" });
    var card = make("div", { class: "lmc-card", id: "lmc-card" });
    widget.appendChild(card);
    root.appendChild(widget);

    // Start screen: when there's no progress, the widget renders a visible
    // start card (instead of hiding behind a gate). Click "Begin" slides to q1.
    var hasProgress = Object.keys(answers).some(function (k) { return answers[k] != null; });
    var phase = hasProgress ? "question" : "start";

    function buildStartSlide() {
      var slide = make("div", { class: "lmc-slide lmc-start-slide", "data-idx": "start" });
      slide.appendChild(make("div", { class: "lmc-category lmc-start-eyebrow" }, "Ready when you are"));
      var h = make("h2", { class: "lmc-start-h", tabindex: "-1" });
      h.innerHTML = "Find <em>where the rot lives</em> in your stack.";
      slide.appendChild(h);
      var p = make("p", { class: "lmc-start-p" });
      var totalQs = questions.length;
      var minutes = data.estimated_minutes || 12;
      p.textContent = totalQs + " quick questions across " + (data.categories || []).length + " categories. About " + minutes + " minutes. Your progress auto-saves to this browser — close the tab and come back anytime.";
      slide.appendChild(p);
      var meta = make("div", { class: "lmc-start-meta" });
      meta.innerHTML =
        '<span class="lmc-start-meta-item"><span class="lmc-start-meta-dot"></span>' + totalQs + ' questions</span>' +
        '<span class="lmc-start-meta-item"><span class="lmc-start-meta-dot"></span>' + minutes + ' min</span>' +
        '<span class="lmc-start-meta-item"><span class="lmc-start-meta-dot"></span>Auto-saves</span>' +
        '<span class="lmc-start-meta-item"><span class="lmc-start-meta-dot"></span>Score shown free</span>';
      slide.appendChild(meta);
      var nav = make("div", { class: "lmc-nav lmc-start-nav" });
      var go = make("button", { class: "lmc-btn lmc-start-btn", type: "button" }, "Start the audit <span aria-hidden=\"true\">→</span>");
      go.addEventListener("click", function () {
        phase = "question";
        renderQuestion("fwd");
        beacon("cta_click", { answers: { target: "start_screen_begin" } });
      });
      nav.appendChild(go);
      slide.appendChild(nav);
      return slide;
    }

    function buildQuestionSlide(slideIdx) {
      var q = questions[slideIdx];
      var slide = make("div", { class: "lmc-slide", "data-idx": String(slideIdx) });
      if (!q) return slide;

      // Progress row: "Question N of M" + hairline fill.
      var totalQs = questions.length;
      var pct = Math.round(((slideIdx + 1) / totalQs) * 100);
      var prog = make("div", { class: "lmc-progress" });
      prog.innerHTML =
        '<div class="lmc-progress-row">' +
          '<span class="lmc-progress-label">Question ' + (slideIdx + 1) + ' of ' + totalQs + '</span>' +
          '<span class="lmc-progress-pct">' + pct + '%</span>' +
        '</div>' +
        '<div class="lmc-progress-track" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Assessment progress">' +
          '<div class="lmc-progress-fill" style="width:' + pct + '%"></div>' +
        '</div>';
      slide.appendChild(prog);

      // Resolve data.json paths for this slide so we can wire edit-mode hooks
      // for the category name, question text, and each answer label.
      var isPersona = !!q.__persona;
      var catIdx = isPersona ? -1 : (data.categories || []).findIndex(function (c) { return (c.id || c.name) === q.category_id; });
      var qIdx = catIdx >= 0 ? (data.categories[catIdx].questions || []).findIndex(function (qq) { return qq.id === q.id; }) : -1;
      var basePath = isPersona
        ? "persona_selector"
        : (catIdx >= 0 && qIdx >= 0 ? "categories[" + catIdx + "].questions[" + qIdx + "]" : null);
      var categoryPath = (!isPersona && catIdx >= 0) ? "categories[" + catIdx + "].name" : null;

      if (q.category_name) {
        var catEl = make("div", { class: "lmc-category" }, esc(q.category_name));
        if (categoryPath && window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(catEl, categoryPath);
        }
        slide.appendChild(catEl);
      }
      var qH = make("h2", { class: "lmc-question", id: "lmc-question-" + slideIdx, tabindex: "-1" }, esc(q.text || q.label || ""));
      if (basePath && window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(qH, basePath + ".text", { multiline: true });
      }
      slide.appendChild(qH);

      var options = q.answers || [];
      if (!options.length) {
        options = [
          { label: "1 — Strongly disagree", score: 1 },
          { label: "2 — Disagree", score: 2 },
          { label: "3 — Neutral", score: 3 },
          { label: "4 — Agree", score: 4 },
          { label: "5 — Strongly agree", score: 5 }
        ];
      }

      var ul = make("ul", { class: "lmc-options", role: "radiogroup", "aria-labelledby": "lmc-question-" + slideIdx });
      options.forEach(function (opt, ix) {
        var li = make("li");
        var inputId = "lmc-q" + slideIdx + "-opt" + ix;
        var checked = (answers[q.id || "__persona"] === ix);
        var label = make("label", { class: "lmc-opt" + (checked ? " selected" : ""), for: inputId });
        var input = make("input", { type: "radio", name: "q" + slideIdx, id: inputId, value: String(ix) });
        if (checked) input.setAttribute("checked", "checked");
        label.appendChild(input);
        var labelSpan = make("span", null, esc(opt.label || opt.text || String(opt)));
        label.appendChild(labelSpan);
        ul.appendChild(li);
        li.appendChild(label);

        // Register the answer label text for inline editing.
        if (basePath && window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(labelSpan, basePath + ".answers[" + ix + "].label", { multiline: true });
        }

        label.addEventListener("click", function (e) {
          // In edit mode, clicks should go to the inline editor on the span,
          // not record an answer. The span's edit-mode handler stops propagation,
          // so this fires only for clicks outside the editable text.
          if (window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled()) {
            e.preventDefault();
            return;
          }
          answers[q.id || "__persona"] = ix;
          if (opt.tag) answers[(q.id || "__persona") + "__tag"] = opt.tag;
          saveAnswers(data.slug, answers);
          setTimeout(function () { goNext(); }, 220);
        });
      });
      slide.appendChild(ul);

      var nav = make("div", { class: "lmc-nav" });
      var back = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Back");
      if (slideIdx === 0) back.setAttribute("disabled", "disabled");
      back.addEventListener("click", function () { if (idx > 0) { idx--; renderQuestion("back"); } });
      var next = make("button", { class: "lmc-btn", type: "button", id: "lmc-next" }, slideIdx === questions.length - 1 ? "See result →" : "Next →");
      if (answers[q.id || "__persona"] == null) next.setAttribute("disabled", "disabled");
      next.addEventListener("click", function () { goNext(); });
      nav.appendChild(back); nav.appendChild(next);
      slide.appendChild(nav);

      return slide;
    }

    function renderQuestion(direction) {
      if (idx >= questions.length) { renderResult(); return; }
      direction = direction === "back" ? "back" : "fwd";
      var newSlide = buildQuestionSlide(idx);
      var current = card.querySelector(".lmc-slide");

      // Honour reduced-motion: skip the slide animation entirely.
      var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (!current || reduced) {
        card.innerHTML = "";
        card.appendChild(newSlide);
        setTimeout(function () { var h = $("#lmc-question-" + idx); if (h) h.focus(); }, 10);
        return;
      }

      // Animate out the current slide, then swap in the new one.
      newSlide.classList.add(direction === "fwd" ? "lmc-in-fwd" : "lmc-in-back");
      current.classList.add(direction === "fwd" ? "lmc-out-fwd" : "lmc-out-back");

      var swapped = false;
      function swap() {
        if (swapped) return; swapped = true;
        if (current && current.parentNode === card) card.removeChild(current);
        card.appendChild(newSlide);
        // Force a reflow before removing the in-* class so the transition fires.
        void newSlide.offsetWidth;
        newSlide.classList.remove("lmc-in-fwd");
        newSlide.classList.remove("lmc-in-back");
        setTimeout(function () { var h = $("#lmc-question-" + idx); if (h) h.focus({ preventScroll: true }); }, 280);
      }
      // Wait for the outgoing transition. Fall back to a hard timeout in case
      // transitionend doesn't fire (e.g. element pulled offscreen).
      current.addEventListener("transitionend", swap, { once: true });
      setTimeout(swap, 320);
    }

    function goNext() {
      var q = questions[idx];
      if (answers[q.id || "__persona"] == null) return;
      if (idx < questions.length - 1) { idx++; renderQuestion("fwd"); }
      else renderResult();
    }

    function renderResult() {
      var res = computeResult(data, answers);
      card.innerHTML = "";
      card.classList.add("lmc-result-card");

      // ── Compute display data ────────────────────────────────────────
      var tierKey = res.tier.class === "low" ? "critical"
                   : res.tier.class === "medium" ? "growth"
                   : "optimized";
      // Headline copy: data.results_copy.tier_headline[tier] overrides
      // the defaults; otherwise we use a generic italicised tier name.
      var copyOverride = (data.results_copy && data.results_copy.tier_headline) || {};
      var tierHeadlineMap = {
        critical:  copyOverride.critical  || "You're at <em>critical</em> risk.",
        growth:    copyOverride.growth    || "You're in <em>growth stage</em>.",
        optimized: copyOverride.optimized || "You're running <em>optimized</em>."
      };
      var headlineHtml = tierHeadlineMap[tierKey] || ("<em>" + esc(res.tier.name || "Score") + "</em>");
      var weakestName = res.weakest && res.weakest.name;
      var weakestPct = res.weakest && res.weakest.score;
      var noteHtml = res.weakest
        ? "Your weakest area is <strong>" + esc(weakestName) + "</strong> (" + weakestPct + "/100). That's where the biggest leak usually lives."
        : "Your overall score tells the story; the category breakdown points to the specific fix.";

      // ── Container ────────────────────────────────────────────────────
      var wrap = make("div", { class: "lmc-result" });

      // ── Score hero (sage progress ring + huge italic score + tier headline)
      var hero = make("div", { class: "lmc-score-hero" });
      hero.setAttribute("data-tier", tierKey);

      // Ring: r=92, circumference ≈ 578. Animation starts at full offset
      // and drops to (1 - score/100) * c on the next paint.
      var R = 92;
      var C = 2 * Math.PI * R;
      var ring = make("div", { class: "lmc-score-ring" });
      ring.innerHTML =
        '<svg viewBox="0 0 200 200" aria-hidden="true">' +
          '<circle class="ring-track" cx="100" cy="100" r="' + R + '"></circle>' +
          '<circle class="ring-fill" cx="100" cy="100" r="' + R + '" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + C.toFixed(2) + '"></circle>' +
        '</svg>' +
        '<div class="lmc-score-ring-center">' +
          '<span class="lmc-score-number" data-target="' + res.overall + '">0</span>' +
          '<span class="lmc-score-denom">out of 100</span>' +
        '</div>';
      hero.appendChild(ring);

      var heroBody = make("div", { class: "lmc-score-body" });
      heroBody.appendChild(make("div", { class: "lmc-score-eyebrow" }, "Your read"));
      var scoreHeadlineEl = make("h2", { class: "lmc-score-headline" }, headlineHtml);
      if (window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(scoreHeadlineEl, "results_copy.tier_headline." + tierKey, { multiline: true });
      }
      heroBody.appendChild(scoreHeadlineEl);
      heroBody.appendChild(make("p", { class: "lmc-score-note" }, noteHtml));
      hero.appendChild(heroBody);
      wrap.appendChild(hero);

      // ── Top-3 gap questions ────────────────────────────────────────
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
        var gapsSec = make("section", { class: "lmc-result-section" });
        gapsSec.style.setProperty("--lmc-delay", "240ms");
        var h = make("h3", { class: "lmc-results-h" });
        h.innerHTML = "Top " + topGaps.length + " gap" + (topGaps.length === 1 ? "" : "s") + " to close <em>this week</em>";
        gapsSec.appendChild(h);
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
        gapsSec.appendChild(list);

        var mondayTxt = (topGaps[0] && topGaps[0].fix) || (res.weakest ? "Start with your weakest category: " + res.weakest.name + "." : "Pick the gap that hurts most this week and ship one fix.");
        var nm = make("p", { class: "lmc-next-move" });
        nm.innerHTML = '<span class="lmc-next-label">What to do Monday</span>' + esc(mondayTxt);
        gapsSec.appendChild(nm);
        wrap.appendChild(gapsSec);
      }

      // ── Capture or unlocked ────────────────────────────────────────
      var captureHost = make("div", { class: "lmc-result-section", id: "lmc-result-capture-host" });
      captureHost.style.setProperty("--lmc-delay", "420ms");
      wrap.appendChild(captureHost);

      if (!captured) {
        var gate = make("div", { class: "lmc-capture", id: "lmc-capture" });
        gate.innerHTML =
          '<h2>Unlock your <em>full report</em></h2>' +
          '<p>Enter your email and we\'ll reveal your per-category breakdown, personalised recommendations, and the 3 fixes I\'d prioritise based on your weakest category.</p>' +
          '<form class="lmc-form" id="lmc-capture-form">' +
          '<label class="sr-only" for="lmc-email">Email</label>' +
          '<input class="lmc-form-input" id="lmc-email" type="email" autocomplete="email" required placeholder="you@company.com" />' +
          '<button class="lmc-btn" type="submit">Unlock report</button>' +
          '</form>' +
          '<p class="lmc-note">No spam. One email with your report, then you decide.</p>';
        captureHost.appendChild(gate);
        var form = gate.querySelector("#lmc-capture-form");
        var emailInput = gate.querySelector("#lmc-email");
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var em = (emailInput || {}).value || "";
          if (!em || em.indexOf("@") === -1) { toast("Enter a valid email"); return; }
          saveEmail(data.slug, em);
          captured = true;
          beacon("complete", {
            email: em,
            overall_score: res.overall,
            tier: res.tier.name,
            per_category: res.per_category,
            weakest_category: res.weakest && res.weakest.id,
            persona: typeof res.persona === "number" && data.persona_selector && data.persona_selector.answers ? (data.persona_selector.answers[res.persona] || {}).tag || null : null,
            answers: answers
          });
          generateShareCard(data, res);
          renderUnlocked(res, captureHost);
        });
      } else {
        generateShareCard(data, res);
        renderUnlocked(res, captureHost);
      }

      card.appendChild(wrap);

      // ── Kick off score-ring + count-up animation after paint ────────
      var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var fillEl = hero.querySelector(".ring-fill");
      var numEl = hero.querySelector(".lmc-score-number");
      if (reduced) {
        if (fillEl) fillEl.style.strokeDashoffset = (C * (1 - res.overall / 100)).toFixed(2);
        if (numEl) numEl.textContent = String(res.overall);
      } else {
        requestAnimationFrame(function () {
          setTimeout(function () {
            if (fillEl) fillEl.style.strokeDashoffset = (C * (1 - res.overall / 100)).toFixed(2);
            if (numEl) countUp(numEl, 0, res.overall, 1300);
          }, 220);
        });
      }
    }

    // Tween a number element from `from` to `to` over `duration` ms.
    function countUp(el, from, to, duration) {
      var start = null;
      function step(ts) {
        if (start == null) start = ts;
        var t = Math.min(1, (ts - start) / duration);
        // easeOutCubic
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = String(Math.round(from + (to - from) * eased));
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = String(to);
      }
      requestAnimationFrame(step);
    }

    // D3.3: best-effort share card generation (legacy engine)
    function generateShareCard(data, res) {
      try {
        var url = window.__scroll_recorder_url || "https://scroll-recorder-production.up.railway.app";
        fetch(url + "/share-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: data.slug,
            score: res.overall,
            tier: res.tier && res.tier.name,
            persona: typeof res.persona === "number" && data.persona_selector && data.persona_selector.answers ? (data.persona_selector.answers[res.persona] || {}).tag : null,
            weakest: res.weakest && res.weakest.name,
            title: data.title,
          }),
        }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          if (j && j.url) {
            ["og:image", "twitter:image"].forEach(function (prop) {
              var sel = prop.indexOf("twitter") === 0 ? 'meta[name="' + prop + '"]' : 'meta[property="' + prop + '"]';
              var m = document.head.querySelector(sel);
              if (!m) { m = document.createElement("meta"); if (prop.indexOf("twitter") === 0) m.setAttribute("name", prop); else m.setAttribute("property", prop); document.head.appendChild(m); }
              m.setAttribute("content", j.url);
            });
            window.__lm_share_card_url = j.url;
          }
        }).catch(function () {});
      } catch (_) {}
    }

    function renderUnlocked(res, host) {
      // host = the .lmc-result-section that previously held the gate.
      // Replace its contents with the unlocked breakdown.
      if (!host) host = card;
      host.innerHTML = "";

      host.appendChild(make("h3", { class: "lmc-result-unlock-h" }, "Per-category <em>breakdown</em>"));

      var catFills = []; // collect to arm bar widths after paint
      var catOrder = 0;
      (data.categories || []).forEach(function (cat, catIdx) {
        var key = cat.id || cat.name;
        var catRes = res.per_category[key];
        if (!catRes) return;
        var block = make("div", { class: "lmc-category-block" });
        block.style.setProperty("--lmc-delay", (catOrder * 90) + "ms");
        var h4 = make("h4", null, esc(cat.name || cat.id));
        if (window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(h4, "categories[" + catIdx + "].name");
        }
        block.appendChild(h4);
        var bar = make("div", { class: "lmc-cat-bar" });
        bar.innerHTML = '<div class="lmc-cat-track"><div class="lmc-cat-fill" style="--lmc-cat-target:' + catRes.score + '%"></div></div><span class="lmc-cat-pct">' + catRes.score + '<span style="font-size:.75em;color:rgba(26,26,26,.5)">/100</span></span>';
        block.appendChild(bar);
        var rec = pickRec(cat, catRes.score);
        // Resolve which tier-key was picked so we can build the edit path.
        var tierKey = catRes.score <= 40 ? "low" : (catRes.score <= 70 ? "mid" : "high");
        // Some data.json files use {critical, growth, optimized} instead.
        var altKey = ({ low: "critical", mid: "growth", high: "optimized" })[tierKey];
        var recBranchKey = (cat.recommendations && (cat.recommendations[tierKey] != null ? tierKey : (cat.recommendations[altKey] != null ? altKey : tierKey)));
        if (rec) {
          var rc = make("div", { class: "lmc-rec" });
          var tag = "Next step";
          if (catRes.score <= 40) tag = "Critical — fix first";
          else if (catRes.score <= 70) tag = "Growth unlock";
          else tag = "Keep sharpening";
          rc.appendChild(make("strong", null, esc(tag)));
          var recPath = "categories[" + catIdx + "].recommendations." + recBranchKey;
          var text = typeof rec === "string" ? rec : (rec.text || rec.headline || "");
          var textNode = document.createTextNode(text);
          // Wrap the text in an editable span so we can register it.
          var textSpan = make("span", { class: "lmc-rec-text" });
          textSpan.appendChild(textNode);
          rc.appendChild(textSpan);
          if (window.LM && window.LM.editMode && typeof rec !== "string") {
            window.LM.editMode.registerField(textSpan, recPath + ".text", { multiline: true });
          }
          var steps = (typeof rec === "object" && Array.isArray(rec.steps)) ? rec.steps : null;
          if (steps && steps.length) {
            var ulSteps = make("ul");
            steps.forEach(function (s, si) {
              var li = make("li", null, esc(s));
              if (window.LM && window.LM.editMode) {
                window.LM.editMode.registerField(li, recPath + ".steps[" + si + "]", { multiline: true });
              }
              ulSteps.appendChild(li);
            });
            rc.appendChild(ulSteps);
          }
          block.appendChild(rc);
        }
        host.appendChild(block);
        catFills.push({ el: block.querySelector(".lmc-cat-fill"), delayMs: 400 + catOrder * 90 });
        catOrder++;
      });

      // Arm bar widths after their parent blocks fade in.
      catFills.forEach(function (entry) {
        setTimeout(function () { if (entry.el) entry.el.classList.add("lmc-cat-fill-armed"); }, entry.delayMs);
      });

      // Bottom CTA — always renders. Falls back to Ivan's Calendly when
      // data.cta is missing so every assessment ships with a clear next step.
      var ctaConf = data.cta || {};
      var ctaUrl = ctaConf.url || "https://calendly.com/ivan-intelligents/30min";
      var ctaHeadlineHtml = ctaConf.headline_html || ctaConf.headline;
      if (!ctaHeadlineHtml) {
        ctaHeadlineHtml = res.tier && res.tier.class === "low"
          ? "Want help <em>closing these gaps</em>?"
          : "Want a second pair of eyes on <em>what to fix first</em>?";
      }
      var ctaDescription = ctaConf.description || "Book a 20-min working session — I'll walk through your weakest category live and sketch the highest-leverage fix. Free, no pitch.";
      var ctaButton = ctaConf.button || "Book a strategy call";
      var ctaBox = make("div", { class: "lmc-unlocked-cta" });
      ctaBox.appendChild(make("p", { class: "lmc-unlocked-cta-eyebrow" }, "Next move"));
      var ctaH3 = make("h3", null, ctaHeadlineHtml);
      ctaBox.appendChild(ctaH3);
      var ctaDescEl = make("p", null, esc(ctaDescription));
      ctaBox.appendChild(ctaDescEl);
      var ctaLink = make("a", { class: "lmc-btn", href: ctaUrl, target: "_blank", rel: "noopener" });
      var ctaBtnSpan = make("span", { class: "lmc-cta-btn-text" }, esc(ctaButton));
      ctaLink.appendChild(ctaBtnSpan);
      ctaLink.appendChild(document.createTextNode(" "));
      ctaLink.appendChild(make("span", { "aria-hidden": "true" }, "→"));
      ctaBox.appendChild(ctaLink);
      host.appendChild(ctaBox);
      if (window.LM && window.LM.editMode) {
        // Edit-mode hooks: writing here creates cta.{} if it doesn't exist.
        window.LM.editMode.registerField(ctaH3, "cta.headline", { multiline: true });
        window.LM.editMode.registerField(ctaDescEl, "cta.description", { multiline: true });
        window.LM.editMode.registerField(ctaBtnSpan, "cta.button");
      }
      ctaLink.addEventListener("click", function (e) {
        if (window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled()) {
          e.preventDefault();
          return;
        }
        beacon("cta_click", { answers: { score: res.overall, tier: res.tier.name, default_cta: !data.cta } });
      });

      // Retake — quiet text link, not a hard button.
      var retakeWrap = make("div", { class: "lmc-retake-wrap" });
      var retake = make("button", { class: "lmc-retake", type: "button" }, "Retake the assessment");
      retake.addEventListener("click", function () {
        if (!confirm("Clear your answers and retake?")) return;
        try { localStorage.removeItem(storageKey(data.slug, "answers")); localStorage.removeItem(storageKey(data.slug, "email")); } catch (_) {}
        location.reload();
      });
      retakeWrap.appendChild(retake);
      host.appendChild(retakeWrap);
    }

    // Initial render: start screen (fresh) or first unanswered question (resume).
    if (phase === "start") {
      card.appendChild(buildStartSlide());
    } else {
      renderQuestion();
    }
    beacon("view", {});
  }

  function init() {
    var root = document.getElementById("lmc-root") || document.querySelector("[data-lm-assessment-src]");
    if (!root) return;
    var defaultSrc = root.getAttribute("data-lm-assessment-src") || "./data.json";
    var params = new URLSearchParams(location.search);
    var src = params.get("preview") === "draft" ? "./data.draft.json" : defaultSrc;
    fetch(src, { credentials: "same-origin" }).then(function (r) {
      if (params.get("preview") === "draft" && !r.ok) {
        return fetch(defaultSrc, { credentials: "same-origin" }).then(function (r2) {
          if (!r2.ok) throw new Error("data.json " + r2.status);
          return r2.json();
        });
      }
      if (!r.ok) throw new Error("data.json " + r.status);
      return r.json();
    }).then(function (data) { render(data, root); }).catch(function (e) {
      root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading assessment:</strong> ' + esc(e.message) + '</div>';
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
