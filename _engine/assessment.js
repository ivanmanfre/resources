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
    var img = make("img", { class: "lmc-intro-avatar", src: "https://ivanmanfredi.com/profile.jpg", alt: "Ivan Manfredi" });
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

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
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
    hi.appendChild(make("h1", { class: "lmc-h1" }, esc(data.title || "Assessment")));
    if (data.subtitle) hi.appendChild(make("p", { class: "lmc-sub" }, esc(data.subtitle)));
    var meta = make("div", { class: "lmc-meta" });
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, questions.length + " questions"));
    if (data.estimated_minutes) meta.appendChild(make("div", { class: "lmc-meta-chip" }, data.estimated_minutes + " min"));
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, "Auto-saves"));
    hi.appendChild(meta);
    hero.appendChild(hi);
    root.appendChild(hero);

    var introSection = buildIntro(data, ".lmc-widget", {
      defaultValueBullet: "15-20 questions, 5 categories. Honest answers = honest result",
      defaultNextBullet: "Score + tier shown free. Email unlocks per-category breakdown + personalized fixes",
      startLabel: "Start the assessment",
      defaultNote: "No signup to take it. Results stay private until you unlock the full report."
    });
    root.appendChild(introSection);

    // Widget area
    var widget = make("div", { class: "lmc-widget" });
    var card = make("div", { class: "lmc-card", id: "lmc-card" });
    widget.appendChild(card);
    root.appendChild(widget);

    function renderQuestion() {
      card.innerHTML = "";
      var q = questions[idx];
      // Progress
      var prog = make("div", { class: "lmc-progress-row" });
      var pct = Math.round((idx / questions.length) * 100);
      prog.innerHTML = '<span>Question <strong>' + (idx + 1) + '</strong> of ' + questions.length + '</span><div class="lmc-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + questions.length + '" aria-valuenow="' + idx + '"><div class="lmc-progress-fill" style="width:' + pct + '%"></div></div><span>' + pct + '%</span>';
      card.appendChild(prog);

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
      options.forEach(function (opt, ix) {
        var li = make("li");
        var inputId = "lmc-q" + idx + "-opt" + ix;
        var checked = (answers[q.id || "__persona"] === ix);
        var label = make("label", { class: "lmc-opt" + (checked ? " selected" : ""), for: inputId });
        var input = make("input", { type: "radio", name: "q" + idx, id: inputId, value: String(ix) });
        if (checked) input.setAttribute("checked", "checked");
        label.appendChild(input);
        label.appendChild(make("span", null, esc(opt.label || opt.text || String(opt))));
        ul.appendChild(li);
        li.appendChild(label);

        label.addEventListener("click", function () {
          answers[q.id || "__persona"] = ix;
          if (opt.tag) answers[(q.id || "__persona") + "__tag"] = opt.tag;
          saveAnswers(data.slug, answers);
          setTimeout(function () { goNext(); }, 200);
        });
      });
      card.appendChild(ul);

      var nav = make("div", { class: "lmc-nav" });
      var back = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Back");
      if (idx === 0) back.setAttribute("disabled", "disabled");
      back.addEventListener("click", function () { if (idx > 0) { idx--; renderQuestion(); } });
      var next = make("button", { class: "lmc-btn", type: "button", id: "lmc-next" }, idx === questions.length - 1 ? "See result →" : "Next →");
      if (answers[q.id || "__persona"] == null) next.setAttribute("disabled", "disabled");
      next.addEventListener("click", goNext);
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
      // Partial reveal: show overall + tier + one-line, gate categories behind email
      card.innerHTML = "";
      var wrap = make("div", { class: "lmc-result" });
      // Score ring
      var circ = 2 * Math.PI * 70;
      var offset = circ - (res.overall / 100) * circ;
      var ringHtml = '<div class="lmc-score-ring">' +
        '<svg width="180" height="180" viewBox="0 0 180 180" aria-hidden="true"><circle class="track" cx="90" cy="90" r="70"/><circle class="arc" cx="90" cy="90" r="70" stroke-dasharray="' + circ.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"/></svg>' +
        '<div class="score-num"><div class="num">' + res.overall + '</div><div class="suffix">out of 100</div></div></div>';
      wrap.innerHTML = ringHtml;
      var tierEl = make("div", { class: "lmc-tier-pill " + (res.tier.class || "") }, esc(res.tier.name));
      wrap.appendChild(tierEl);
      var lead = res.weakest
        ? "Your weakest area is <strong>" + esc(res.weakest.name) + "</strong> (" + res.weakest.score + "/100). That's where the biggest hours-per-week leak usually lives."
        : "Your overall score tells the story; the category breakdown points to the specific fix.";
      wrap.appendChild(make("p", { class: "lmc-result-lead" }, lead));
      card.appendChild(wrap);

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
            persona: typeof res.persona === "number" && data.persona_selector && data.persona_selector.answers ? (data.persona_selector.answers[res.persona] || {}).tag || null : null,
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
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(currentUrl).then(function () { toast("Link copied"); });
        beacon("share", { answers: { target: "copy_link", score: res.overall } });
      });
      share.appendChild(copy);
      var retake = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Retake");
      retake.addEventListener("click", function () {
        if (!confirm("Clear your answers and retake?")) return;
        try { localStorage.removeItem(storageKey(data.slug, "answers")); localStorage.removeItem(storageKey(data.slug, "email")); } catch (_) {}
        location.reload();
      });
      share.appendChild(retake);
      unl.appendChild(share);

      // Bottom CTA if defined
      if (data.cta && data.cta.url) {
        var ctaBox = make("div", { style: "margin-top:2rem;padding:1.5rem;border:4px solid #000;background:#fff;box-shadow:8px 8px 0 #00E676;text-align:center;" });
        ctaBox.innerHTML = '<div style="font-size:1.25rem;font-weight:900;text-transform:uppercase;margin:0 0 .5rem;">' + esc(data.cta.headline || "Want help closing these gaps?") + '</div>' +
          '<p style="margin:0 0 1rem;">' + esc(data.cta.description || "Book a 20-min working session. Free, no pitch.") + '</p>' +
          '<a class="lmc-btn" href="' + esc(data.cta.url) + '" target="_blank" rel="noopener">' + esc(data.cta.button || "Book Strategy Call") + '</a>';
        unl.appendChild(ctaBox);
        ctaBox.querySelector("a").addEventListener("click", function () { beacon("cta_click", { answers: { score: res.overall, tier: res.tier.name } }); });
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
