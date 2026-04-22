/* LM Checklist Engine — vanilla JS, reads data.json, persists to localStorage, email-gated capture, beacon-integrated */
(function () {
  "use strict";
  var BEACON = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function make(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html !== undefined) e.innerHTML = html; return e; }
  function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }

  function toast(msg) {
    var t = $("#lmc-toast");
    if (!t) { t = make("div", { id: "lmc-toast", class: "lmc-toast" }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2500);
  }

  function beacon(event_type, payload) {
    try {
      var q = new URLSearchParams(location.search);
      var body = Object.assign({
        event_type: event_type,
        lm_slug: window.__lm_slug || (window.__lm_data && window.__lm_data.slug) || "",
        src: q.get("src") || "direct",
        utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") },
        prospect_id: q.get("pid") || null,
        referrer: document.referrer || ""
      }, payload || {});
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BEACON, new Blob([JSON.stringify(body)], { type: "application/json" }));
      } else {
        fetch(BEACON, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
      }
    } catch (_) {}
  }

  // Tri-state: "not_yet" | "partial" | "done". Legacy `checked` booleans are migrated to done/not_yet.
  var STATE_SCORE = { not_yet: 0, partial: 0.5, done: 1 };
  var IMPACT_WEIGHT = { high: 3, medium: 2, low: 1 };
  function saveState(slug, state) { try { localStorage.setItem("ivan.checklist." + slug + ".states", JSON.stringify(state.states || {})); localStorage.setItem("ivan.checklist." + slug + ".email", state.email || ""); } catch (_) {} }
  function readState(slug) {
    var states = {}; var email = "";
    try { states = JSON.parse(localStorage.getItem("ivan.checklist." + slug + ".states") || "{}"); } catch (_) {}
    // Migrate legacy binary state, if present, into tri-state.
    if (!states || !Object.keys(states).length) {
      try {
        var legacy = JSON.parse(localStorage.getItem("ivan.checklist." + slug + ".checked") || "{}");
        Object.keys(legacy || {}).forEach(function (k) { states[k] = legacy[k] ? "done" : "not_yet"; });
      } catch (_) {}
    }
    try { email = localStorage.getItem("ivan.checklist." + slug + ".email") || ""; } catch (_) {}
    return { states: states, email: email };
  }
  function scoreItem(state) { return STATE_SCORE[state] != null ? STATE_SCORE[state] : 0; }
  function tierFor(pct) {
    if (pct < 50) return { key: "critical", label: "Critical", note: "Close the high-impact gaps before you scale anything else." };
    if (pct < 80) return { key: "growth", label: "Growth stage", note: "You're on the curve. Close these gaps to compound." };
    return { key: "optimized", label: "Optimized", note: "Maintain the streak and re-audit in 60 days." };
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

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    var state = readState(data.slug);
    root.innerHTML = "";

    // Hero
    var hero = make("section", { class: "lmc-hero" });
    var heroInner = make("div", { class: "lmc-container" });
    heroInner.appendChild(make("div", { class: "lmc-badge" }, escapeHtml(data.brand && data.brand.hero_badge || "Action Checklist")));
    heroInner.appendChild(make("h1", { class: "lmc-h1" }, escapeHtml(data.title || "Checklist")));
    if (data.subtitle) heroInner.appendChild(make("p", { class: "lmc-sub" }, escapeHtml(data.subtitle)));
    var meta = make("div", { class: "lmc-meta" });
    var total = 0; (data.sections || []).forEach(function (s) { total += (s.items || []).length; });
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, total + " items"));
    if (data.estimated_minutes) meta.appendChild(make("div", { class: "lmc-meta-chip" }, data.estimated_minutes + " min"));
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, "Auto-saves"));
    heroInner.appendChild(meta);
    hero.appendChild(heroInner);
    root.appendChild(hero);

    var introSection = buildIntro(data, ".lmc-progress-wrap", {
      defaultValueBullet: "Built to find the 3 highest-impact gaps in about 30 min",
      defaultNextBullet: "Email only if you want a tailored follow-up with the gaps you didn't check",
      startLabel: "Start the checklist",
      defaultNote: "No signup to use it. Check items off; progress auto-saves in this browser."
    });
    root.appendChild(introSection);

    // Progress bar (sticky)
    var prog = make("div", { class: "lmc-progress-wrap" });
    prog.innerHTML = '<div class="lmc-progress-inner"><span id="lmc-prog-label">0 / ' + total + ' complete</span><div class="lmc-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="0"><div class="lmc-progress-fill" id="lmc-prog-fill"></div></div><span id="lmc-prog-pct">0%</span></div>';
    root.appendChild(prog);

    // Sections with tri-state rating controls
    var content = make("main", { class: "lmc-container" });
    (data.sections || []).forEach(function (s) {
      var sec = make("section", { class: "lmc-section" });
      sec.appendChild(make("h2", { class: "lmc-section-title" }, escapeHtml(s.title || "")));
      if (s.description) sec.appendChild(make("p", { class: "lmc-section-desc" }, escapeHtml(s.description)));
      (s.items || []).forEach(function (it) {
        var curState = state.states[it.id] || "not_yet";
        var row = make("div", { class: "lmc-item state-" + curState });
        row.setAttribute("data-item-id", it.id);
        var txt = make("div", { class: "lmc-text" });
        txt.appendChild(make("span", null, escapeHtml(it.text || "")));
        if (it.tip) txt.appendChild(make("span", { class: "lmc-tip" }, escapeHtml(it.tip)));
        if (it.impact) {
          var imp = make("span", { class: "lmc-impact lmc-impact-" + it.impact }, (it.impact || "").toUpperCase() + " IMPACT");
          txt.appendChild(imp);
        }
        // Tri-state toggle: Not yet / Partial / Done
        var group = make("div", { class: "lmc-state-group", role: "radiogroup", "aria-label": "Status for " + (it.text || "item") });
        ["not_yet", "partial", "done"].forEach(function (st) {
          var labels = { not_yet: "Not yet", partial: "Partial", done: "Done" };
          var btn = make("button", {
            class: "lmc-state-btn state-" + st + (curState === st ? " selected" : ""),
            type: "button",
            role: "radio",
            "aria-checked": curState === st ? "true" : "false",
            "data-state": st
          }, escapeHtml(labels[st]));
          group.appendChild(btn);
        });
        row.appendChild(txt);
        row.appendChild(group);
        sec.appendChild(row);
      });
      content.appendChild(sec);
    });

    // Results panel — appears when every item has been rated (no longer "not_yet")
    var resultsPanel = make("section", { class: "lmc-results", id: "lmc-results", "aria-live": "polite" });
    resultsPanel.innerHTML = '<div class="lmc-results-inner"></div>';
    content.appendChild(resultsPanel);

    // Capture (collapsed until 50% done)
    var cta = data.completion_cta || {};
    var capture = make("section", { class: "lmc-capture", id: "lmc-capture", "aria-hidden": "false" });
    capture.innerHTML =
      '<h2>' + escapeHtml(cta.headline || "Want the fix for your top 3 gaps?") + '</h2>' +
      '<p>' + escapeHtml(cta.description || "Enter your email and I'll send you a tailored automation plan based on what you didn't check.") + '</p>' +
      '<form class="lmc-form" id="lmc-capture-form">' +
      '<label class="sr-only" for="lmc-email">Email</label>' +
      '<input class="lmc-input" id="lmc-email" name="email" type="email" autocomplete="email" required placeholder="you@company.com" value="' + escapeHtml(state.email) + '" />' +
      '<button class="lmc-btn" type="submit">Email me my plan</button>' +
      '</form>' +
      '<p class="lmc-note">No spam. One email, then you decide.</p>';
    content.appendChild(capture);

    // Footer actions
    var actions = make("div", { class: "lmc-footer-actions" });
    actions.innerHTML =
      '<button class="lmc-btn lmc-btn-secondary" id="lmc-copy-md" type="button">Copy as Markdown</button>' +
      '<button class="lmc-btn lmc-btn-secondary" id="lmc-reset" type="button">Reset progress</button>';
    content.appendChild(actions);
    root.appendChild(content);

    // Wire up — scoring pass produces overall %, per-section %, and ranked gap list.
    function compute() {
      var current = readState(data.slug);
      var totalItems = 0, rated = 0, earned = 0, possible = 0;
      var gaps = [];
      (data.sections || []).forEach(function (s) {
        var sEarned = 0, sPossible = 0, sItems = 0;
        (s.items || []).forEach(function (it) {
          var st = current.states[it.id] || "not_yet";
          var impactKey = (it.impact || "medium").toLowerCase();
          var w = IMPACT_WEIGHT[impactKey] || 2;
          var sc = scoreItem(st);
          totalItems++;
          sItems++;
          sEarned += sc * w;
          sPossible += w;
          earned += sc * w;
          possible += w;
          if (current.states[it.id]) rated++;
          // Gap weight = impact × (1 − score)
          if (sc < 1) gaps.push({ id: it.id, text: it.text || "", tip: it.tip || "", impact: impactKey, section: s.id || s.title, state: st, gapScore: w * (1 - sc) });
        });
      });
      var overallPct = possible ? Math.round((earned / possible) * 100) : 0;
      gaps.sort(function (a, b) { return b.gapScore - a.gapScore; });
      return { overallPct: overallPct, totalItems: totalItems, rated: rated, gaps: gaps };
    }

    function update() {
      var r = compute();
      // Progress bar (score-weighted, not item-count-weighted)
      var fill = $("#lmc-prog-fill"); if (fill) fill.style.width = r.overallPct + "%";
      var pctEl = $("#lmc-prog-pct"); if (pctEl) pctEl.textContent = r.overallPct + "%";
      var topGaps = r.gaps.filter(function (g) { return g.impact === "high"; }).length;
      var lbl = $("#lmc-prog-label");
      if (lbl) lbl.textContent = r.rated + " / " + r.totalItems + " rated" + (topGaps ? " · " + topGaps + " high-impact gap" + (topGaps === 1 ? "" : "s") : "");
      var bar = document.querySelector(".lmc-progress-bar"); if (bar) bar.setAttribute("aria-valuenow", r.overallPct);
      root.classList.toggle("complete", r.rated === r.totalItems && r.totalItems > 0);

      // Results panel — render only once all items rated.
      var panel = $("#lmc-results .lmc-results-inner");
      if (panel) {
        if (r.rated === r.totalItems && r.totalItems > 0) {
          var t = tierFor(r.overallPct);
          var top = r.gaps.slice(0, 3);
          var gapsHtml = top.length
            ? '<ol class="lmc-gap-list">' + top.map(function (g, i) {
                return '<li class="lmc-gap state-' + g.state + '">' +
                  '<div class="lmc-gap-rank">' + (i + 1) + '</div>' +
                  '<div class="lmc-gap-body">' +
                    '<div class="lmc-gap-head"><span class="lmc-gap-text">' + escapeHtml(g.text) + '</span> <span class="lmc-impact lmc-impact-' + g.impact + '">' + g.impact.toUpperCase() + '</span></div>' +
                    (g.tip ? '<div class="lmc-gap-fix"><span class="lmc-gap-fix-label">Fix</span>' + escapeHtml(g.tip) + '</div>' : '') +
                  '</div>' +
                '</li>';
              }).join('') + '</ol>'
            : '<p class="lmc-gap-empty">Every item rated Done. Maintain the streak and re-audit in 60 days.</p>';
          panel.innerHTML =
            '<div class="lmc-tier lmc-tier-' + t.key + '">' +
              '<div class="lmc-tier-head">' +
                '<span class="lmc-tier-label">' + escapeHtml(t.label) + '</span>' +
                '<span class="lmc-tier-score"><em>' + r.overallPct + '</em><span>/100</span></span>' +
              '</div>' +
              '<p class="lmc-tier-note">' + escapeHtml(t.note) + '</p>' +
            '</div>' +
            (top.length ? '<h3 class="lmc-results-h">Top ' + top.length + ' gap' + (top.length === 1 ? '' : 's') + ' to close <em>this week</em></h3>' : '') +
            gapsHtml +
            (top.length ? '<p class="lmc-next-move"><span class="lmc-next-label">What to do Monday</span>' + escapeHtml(top[0].tip || top[0].text) + '</p>' : '');
          panel.parentElement.classList.add("ready");
        } else {
          panel.innerHTML = '<p class="lmc-results-pending">Rate every item to unlock your score, tier, and top-3 gaps.</p>';
          panel.parentElement.classList.remove("ready");
        }
      }
    }
    update();

    // Scroll-triggered entrance for sections + items (editorial reveal)
    try {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add("in-view"); io.unobserve(entry.target); }
        });
      }, { root: null, rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
      root.querySelectorAll(".lmc-section, .lmc-item").forEach(function (el, i) {
        // Tiny stagger so rows don't all pop at once
        el.style.transitionDelay = Math.min(i, 8) * 40 + "ms";
        io.observe(el);
      });
    } catch (_) {
      // Older browsers without IntersectionObserver — just reveal everything immediately.
      root.querySelectorAll(".lmc-section, .lmc-item").forEach(function (el) { el.classList.add("in-view"); });
    }

    // Tri-state toggle handler — click a Not yet / Partial / Done pill to set state.
    root.querySelectorAll(".lmc-state-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var row = btn.closest(".lmc-item");
        if (!row) return;
        var id = row.getAttribute("data-item-id");
        var newState = btn.getAttribute("data-state");
        var st = readState(data.slug);
        st.states = st.states || {};
        st.states[id] = newState;
        saveState(data.slug, st);
        // Re-sync this row's UI (all three pills + row class)
        row.className = row.className.replace(/\bstate-(not_yet|partial|done)\b/g, "").trim() + " state-" + newState;
        row.querySelectorAll(".lmc-state-btn").forEach(function (b) {
          var isMe = b === btn;
          b.classList.toggle("selected", isMe);
          b.setAttribute("aria-checked", isMe ? "true" : "false");
        });
        update();
        beacon("cta_click", { answers: { item_id: id, state: newState } });
      });
    });

    // Capture form
    var form = $("#lmc-capture-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = ($("#lmc-email") || {}).value || "";
        if (!email || email.indexOf("@") === -1) { toast("Enter a valid email"); return; }
        var st = readState(data.slug); st.email = email; saveState(data.slug, st);
        var r = compute();
        var gaps = r.gaps.map(function (g) { return { item_id: g.id, text: (g.text || "").slice(0, 200), impact: g.impact, state: g.state }; });
        beacon("capture", { email: email, answers: { gaps: gaps, score: r.overallPct, rated: r.rated, total: r.totalItems } });
        toast("Got it. Check your inbox in the next few minutes.");
        form.innerHTML = '<p style="font-weight:700;color:var(--accent)">&#10003; Sent to ' + escapeHtml(email) + '. If it doesn\'t arrive, check Promotions.</p>';
      });
    }

    // Copy-as-markdown — outputs the audit as a scored report
    var copyBtn = $("#lmc-copy-md");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var r = compute();
        var t = tierFor(r.overallPct);
        var md = "# " + (data.title || "Audit") + "\n\n";
        md += "**Score:** " + r.overallPct + " / 100 — **" + t.label + "**  \n";
        md += "_" + t.note + "_\n\n";
        var st = readState(data.slug);
        var stateLabel = { not_yet: "Not yet", partial: "Partial", done: "Done" };
        (data.sections || []).forEach(function (s) {
          md += "\n## " + (s.title || "") + "\n\n";
          (s.items || []).forEach(function (it) {
            var cur = st.states[it.id] || "not_yet";
            md += "- **[" + stateLabel[cur] + "]** " + (it.text || "") + (it.impact ? "  _(" + it.impact + " impact)_" : "") + "\n";
            if (it.tip && cur !== "done") md += "   > Fix: " + it.tip + "\n";
          });
        });
        if (r.gaps.length) {
          md += "\n## Top gaps to close this week\n\n";
          r.gaps.slice(0, 3).forEach(function (g, i) {
            md += (i + 1) + ". **" + g.text + "** _(" + g.impact + " impact)_\n";
            if (g.tip) md += "   - Fix: " + g.tip + "\n";
          });
        }
        md += "\n---\nFrom Ivan Manfredi: " + location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(md).then(function () { toast("Copied Markdown to clipboard"); });
        } else {
          toast("Copy not supported in this browser");
        }
        beacon("share", { answers: { format: "markdown" } });
      });
    }

    // Reset
    var resetBtn = $("#lmc-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (!confirm("Clear all ratings for this audit?")) return;
        try {
          localStorage.removeItem("ivan.checklist." + data.slug + ".states");
          localStorage.removeItem("ivan.checklist." + data.slug + ".checked");
        } catch (_) {}
        location.reload();
      });
    }

    // Fire view
    beacon("view", {});
  }

  function init() {
    var root = document.getElementById("lmc-root") || document.querySelector("[data-lm-checklist-src]");
    if (!root) return;
    var src = root.getAttribute("data-lm-checklist-src") || "./data.json";
    fetch(src, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("data.json " + r.status); return r.json(); }).then(function (data) {
      render(data, root);
    }).catch(function (e) {
      root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading checklist:</strong> ' + escapeHtml(e.message) + '</div>';
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
