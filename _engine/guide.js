/* Guide engine — editorial long-form with per-section self-placement (tri-state
 * Not yet / Partial / Done). Data.json shape:
 * { slug, title, subtitle, estimated_minutes, brand, intro?, sections: [
 *    { id, title, html?, text?, self_prompt? } ] } */
(function () {
  "use strict";
  if (!window.LM) { console.error("shared.js not loaded"); return; }
  var L = window.LM;
  var STATE_LABEL = { not_yet: "Not yet", partial: "Partial", done: "Done" };
  var STATE_SCORE = { not_yet: 0, partial: 0.5, done: 1 };

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    var slug = data.slug;
    var states = L.readKV("guide", slug, "states", {}) || {};
    var captured = !!L.readKV("guide", slug, "email", null);

    root.className = "lmc-root lmg-root";
    root.innerHTML = "";
    root.appendChild(L.buildHero(data, {
      badge: (data.brand && data.brand.hero_badge) || "Guide",
      metaChips: [
        (data.sections || []).length + " sections",
        (data.estimated_minutes || 10) + " min",
        "Self-placement"
      ]
    }));
    root.appendChild(L.buildIntro(data, ".lmg-progress-wrap", {
      tool_type: "guide",
      defaultValueBullet: "Rate your team's current practice at the bottom of each section",
      defaultNextBullet: "End-of-guide summary shows which chapters to revisit. Emailed if you want",
      startLabel: "Start reading",
      defaultNote: "You don't have to rate anything. But rating unlocks a personalized summary."
    }));

    // Sticky progress bar
    var prog = L.make("div", { class: "lmg-progress-wrap" });
    prog.innerHTML = '<div class="lmg-progress-inner">' +
      '<span id="lmg-prog-label">0 / ' + (data.sections || []).length + ' rated</span>' +
      '<div class="lmg-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="lmg-progress-fill" id="lmg-prog-fill"></div></div>' +
      '<span id="lmg-prog-pct">0%</span>' +
    '</div>';
    root.appendChild(prog);

    // Sections
    var main = L.make("main", { class: "lmc-container lmg-prose" });
    (data.sections || []).forEach(function (s) {
      var sec = L.make("section", { class: "lmg-section", id: s.id ? ("section-" + s.id) : null });
      sec.setAttribute("data-section-id", s.id || s.title);
      if (s.title) sec.appendChild(L.make("h2", null, L.esc(s.title)));
      if (s.html) {
        var body = L.make("div");
        body.innerHTML = s.html;
        sec.appendChild(body);
      } else if (s.text) {
        sec.appendChild(L.make("p", null, L.esc(s.text)));
      }
      // Self-placement block
      var prompt = s.self_prompt || "Is your team already doing this?";
      var cur = states[s.id || s.title] || "not_yet";
      var self = L.make("div", { class: "lmg-self" });
      self.innerHTML = '<div class="lmg-self-prompt"><span>Self-placement</span>' + L.esc(prompt) + '</div>' +
        '<div class="lmg-self-group" role="radiogroup" aria-label="Self-placement">' +
          ["not_yet", "partial", "done"].map(function (st) {
            return '<button class="lmg-self-btn state-' + st + (cur === st ? ' selected' : '') +
              '" type="button" role="radio" aria-checked="' + (cur === st ? "true" : "false") +
              '" data-state="' + st + '">' + STATE_LABEL[st] + '</button>';
          }).join('') +
        '</div>';
      sec.appendChild(self);
      main.appendChild(sec);
    });

    // Summary panel (hidden until at least one rated)
    var pending = L.make("p", { class: "lmg-summary-pending" }, "Rate a section above to start building your personalized summary.");
    main.appendChild(pending);
    var summary = L.make("section", { class: "lmg-summary", id: "lmg-summary", "aria-live": "polite" });
    main.appendChild(summary);

    // Capture (email gate)
    var gate = L.make("section", { class: "lmc-capture", id: "lmg-capture" });
    gate.innerHTML = '<h2>Send me the <em>chapters I skipped</em></h2>' +
      '<p>One email with standalone PDFs of just the sections you rated Not yet.</p>' +
      '<form class="lmc-form" id="lmg-form">' +
        '<label class="sr-only" for="lmg-email">Email</label>' +
        '<input class="lmc-input" type="email" id="lmg-email" autocomplete="email" required placeholder="you@company.com" />' +
        '<button class="lmc-btn" type="submit">Email me the chapters</button>' +
      '</form>' +
      '<p class="lmc-note">One email. Unsubscribe any time.</p>';
    main.appendChild(gate);

    root.appendChild(main);

    // State wiring
    function compute() {
      var sections = data.sections || [];
      var rated = 0;
      var bySection = sections.map(function (s) {
        var st = states[s.id || s.title] || null;
        if (st) rated++;
        return { section: s, state: st };
      });
      var scored = bySection.filter(function (b) { return b.state; });
      var score = scored.length
        ? Math.round(scored.reduce(function (acc, b) { return acc + STATE_SCORE[b.state]; }, 0) / scored.length * 100)
        : 0;
      var notYet = bySection.filter(function (b) { return b.state === "not_yet"; });
      return { total: sections.length, rated: rated, score: score, notYet: notYet };
    }
    function update() {
      var r = compute();
      var fill = document.getElementById("lmg-prog-fill"); if (fill) fill.style.width = r.score + "%";
      var pct = document.getElementById("lmg-prog-pct"); if (pct) pct.textContent = r.score + "%";
      var lbl = document.getElementById("lmg-prog-label"); if (lbl) lbl.textContent = r.rated + " / " + r.total + " rated";
      root.classList.toggle("rated", r.rated > 0);

      var panel = document.getElementById("lmg-summary");
      if (!panel) return;
      if (r.rated === 0) { panel.innerHTML = ""; return; }

      var t = L.tierFor(r.score);
      var notYet = r.notYet;
      panel.innerHTML =
        '<div class="lmc-tier lmc-tier-' + t.key + '">' +
          '<div class="lmc-tier-head">' +
            '<span class="lmc-tier-label">Where you stand</span>' +
            '<span class="lmc-tier-score"><em>' + r.score + '</em><span>/100</span></span>' +
          '</div>' +
          '<p class="lmc-tier-note">Based on ' + r.rated + ' of ' + r.total + ' sections rated. ' + L.esc(t.note) + '</p>' +
        '</div>' +
        (notYet.length
          ? '<h3 class="lmc-results-h">Chapters to revisit <em>this week</em></h3>' +
            '<ol class="lmc-gap-list">' + notYet.slice(0, 3).map(function (n, i) {
              return '<li class="lmc-gap">' +
                '<div class="lmc-gap-rank">' + (i + 1) + '</div>' +
                '<div class="lmc-gap-body"><div class="lmc-gap-head"><span class="lmc-gap-text">' + L.esc(n.section.title || n.section.id) + '</span></div></div>' +
              '</li>';
            }).join('') + '</ol>' +
            '<p class="lmc-next-move"><span class="lmc-next-label">What to do Monday</span>Re-read "' + L.esc(notYet[0].section.title || "") + '" with your team. Pick the one step you can close by Friday.</p>'
          : '<p style="color:var(--ink-soft);font-size:1rem;line-height:1.55;">Every rated section came back Done or Partial. Re-rate in 60 days to verify it stuck.</p>'
        );
    }
    update();

    // Self-placement handlers
    main.querySelectorAll(".lmg-self-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".lmg-section");
        if (!row) return;
        var sid = row.getAttribute("data-section-id");
        var newState = btn.getAttribute("data-state");
        states[sid] = newState;
        L.writeKV("guide", slug, "states", states);
        btn.closest(".lmg-self-group").querySelectorAll(".lmg-self-btn").forEach(function (b) {
          var isMe = b === btn;
          b.classList.toggle("selected", isMe);
          b.setAttribute("aria-checked", isMe ? "true" : "false");
        });
        update();
        L.beacon("guide", "self_placement", { answers: { section_id: sid, state: newState } });
      });
    });

    // Scroll reveal
    L.observeReveal(root, ".lmg-section");

    // Capture
    var form = document.getElementById("lmg-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var em = (document.getElementById("lmg-email") || {}).value || "";
        if (!L.emailIsValid(em)) { L.toast("Enter a valid email"); return; }
        L.writeKV("guide", slug, "email", em);
        L.updateReader({ email: em });
        captured = true;
        var r = compute();
        L.beacon("guide", "capture", {
          email: em,
          score: r.score, rated: r.rated, total: r.total,
          answers: { not_yet_sections: r.notYet.map(function (n) { return n.section.id || n.section.title; }) }
        });
        form.innerHTML = '<p style="font-weight:700;color:var(--accent-light)">&#10003; Sent. Check your inbox in a few minutes.</p>';
      });
    }

    L.beacon("guide", "view");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-lm-guide-src]") || document.querySelector("#lmc-root");
    if (!root) return;
    var src = root.getAttribute("data-lm-guide-src") || "./data.json";
    fetch(src, { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("data.json " + r.status); return r.json(); })
      .then(function (data) { render(data, root); })
      .catch(function (e) {
        root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading guide:</strong> ' + L.esc(e.message) + '</div>';
      });
  });
})();
