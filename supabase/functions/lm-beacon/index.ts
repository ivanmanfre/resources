import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://resources.inboundonsteroids.com", // canonical Ivan-lane resources domain (2026-08-08 migration)
  "https://resources.ivanmanfredi.com", // legacy domain, kept serving so old links never die
  "https://resources.risedtc.com", // Rise DTC client resources site (rise-dtc-resources Pages repo)
  "https://ivanmanfredi.com",
  "https://www.ivanmanfredi.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8085",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://resources.ivanmanfredi.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

// Added 2026-05-17 for stack-picker engine: branch_pick, result, intro_start
// Added 2026-05-17 for architecture engine: node_click, panel_view
// Added 2026-05-17 for ai-walkthrough engine: analysis_run, quota_hit
// landing_capture RESTORED 2026-08-08: gated landing-page opt-in (first name + email →
// email delivery of the resource link). Present in the June lineage, lost in a later
// redeploy from a stale source — every /get/ landing form 400'd from mid-June until now.
// v49 (2026-09-02, inbound-engine P3 item 2): ip_hash de-salted from per-slug to one
// global LM_IP_SALT env pepper — see the ip_hash line below for detail.
const VALID_EVENTS = new Set(["view", "capture", "complete", "cta_click", "share", "reply", "partial_progress", "brief_download", "branch_pick", "result", "intro_start", "node_click", "panel_view", "analysis_run", "quota_hit", "landing_capture"]);

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeLinkedInUrl(raw: string | null): string | null {
  if (!raw) return null;
  let u = String(raw).trim().toLowerCase();
  if (!u) return null;
  if (u.startsWith("http://")) u = "https://" + u.slice(7);
  if (!u.startsWith("https://")) u = "https://" + u;
  if (u.startsWith("https://linkedin.com")) u = "https://www.linkedin.com" + u.slice("https://linkedin.com".length);
  return u.replace(/\/+$/, "");
}

async function pickSequence(supabase: any, format: string, event_type: string): Promise<string | null> {
  // lead_magnets.format values are Title Case with spaces ("AI Kit") while
  // trigger_filter words are snake_case ("ai_kit") — spaces map to underscores.
  // Hyphens stay: waitlist-lead / qualified-lead formats match verbatim.
  const f = (format || "").toLowerCase().replace(/ /g, "_");
  const { data: seqs } = await supabase.from("nurture_sequences").select("id, trigger_type, trigger_filter").eq("is_active", true);
  for (const s of seqs || []) {
    if (s.trigger_type !== event_type) continue;
    const formats = (s.trigger_filter?.format || []) as string[];
    if (formats.some((x: string) => f.includes(x.toLowerCase()))) return s.id;
  }
  return null;
}

// Stack-picker leaf-keyed routing
async function pickSequenceByLeafTemplate(supabase: any, leaf_template_key: string): Promise<string | null> {
  if (!leaf_template_key) return null;
  const { data: seqs } = await supabase.from("nurture_sequences").select("id, trigger_type, trigger_filter").eq("is_active", true);
  for (const s of seqs || []) {
    if (s.trigger_type !== "capture") continue;
    const keys = (s.trigger_filter?.leaf_template_key || []) as string[];
    if (keys.includes(leaf_template_key)) return s.id;
  }
  return null;
}

async function enqueueSequence(supabase: any, args: {
  sequence_id: string; email: string; lm_slug: string; lm_title: string | null;
  custom_fields: Record<string, unknown>; first_name?: string | null;
}) {
  const { data: existing } = await supabase
    .from("nurture_subscribers").select("id, unsubscribed_at")
    .eq("email", args.email).eq("sequence_id", args.sequence_id).maybeSingle();
  if (existing && existing.unsubscribed_at) return { skipped: true, reason: "unsubscribed" };
  let subscriber_id = existing?.id as string | undefined;
  if (!subscriber_id) {
    const { data: sub, error } = await supabase.from("nurture_subscribers").insert({
      email: args.email, sequence_id: args.sequence_id, lm_slug: args.lm_slug, lm_title: args.lm_title,
      custom_fields: args.custom_fields, first_name: args.first_name || null,
    }).select("id").single();
    if (error) return { error: error.message };
    subscriber_id = sub.id;
  }
  const weakest = (args.custom_fields.weakest_category as string | undefined) || null;
  const { data: step1 } = await supabase.from("nurture_emails")
    .select("id, step, delay_hours, branch_on_field, branch_value")
    .eq("sequence_id", args.sequence_id).eq("step", 1).eq("is_active", true);
  const chosen = (step1 || []).find((e: any) =>
    !e.branch_on_field || (e.branch_on_field === "weakest_category" && e.branch_value === weakest)
  ) || (step1 || [])[0];
  if (!chosen) return { error: "no_step1_email" };
  const scheduled_for = new Date(Date.now() + chosen.delay_hours * 3600 * 1000).toISOString();
  const { error: qErr } = await supabase.from("nurture_queue").insert({
    subscriber_id, email_id: chosen.id, scheduled_for, status: "pending",
  });
  return { subscriber_id, email_id: chosen.id, scheduled_for, error: qErr?.message };
}

// Delivery-link resolution for landing_capture. lm_drafts_v2 first (its resource_url is
// the canonical delivery target when a draft row exists), lead_magnets.resource_page_url
// as the legacy/pack fallback.
async function resolveResource(supabase: any, lm_slug: string): Promise<{ url: string | null; title: string | null }> {
  const { data: draft } = await supabase
    .from("lm_drafts_v2").select("resource_url, topic, landing_copy")
    .eq("slug", lm_slug).not("resource_url", "is", null).limit(1).maybeSingle();
  if (draft && draft.resource_url) {
    const headline = draft.landing_copy && (draft.landing_copy as any).headline;
    return { url: draft.resource_url, title: cleanTitle(headline || draft.topic) };
  }
  const { data: legacy } = await supabase
    .from("lead_magnets").select("resource_page_url, title")
    .eq("slug", lm_slug).limit(1).maybeSingle();
  if (legacy && legacy.resource_page_url) return { url: legacy.resource_page_url, title: cleanTitle(legacy.title) };
  return { url: null, title: null };
}

// Trim long topics to a clean name and strip dashes/parentheticals (no AI-slop em-dashes in subject/body).
function cleanTitle(t: string | null): string | null {
  if (!t) return t;
  const s = String(t).split(/\s+[—–-]\s+/)[0].split(":")[0].split(" (")[0].trim();
  return s || String(t).trim();
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function escapeAttr(s: string): string { return escapeHtml(s); }

// Per-tenant delivery-email branding, keyed on the lead_magnets row's client_id (server
// data, never a page-supplied value). Default = Ivan. risedtc.com is Resend-verified
// (domains API, 2026-08-08), so the RISE brand sends from its own domain.
const DELIVERY_BRANDS: Record<string, { from: string; reply_to: string; btnBg: string; btnFg: string; signoff_name: string; signoff_site: string; reply_prompt: string }> = {
  risedtc: {
    // Sender = the identity the RISE scan lane already uses (live Resend send log).
    // Reply-to = Mattan's REAL mailbox (Ivan ruling 2026-08-08), proven receiving in
    // the lm_events opt-in log.
    from: "Mattan from RISE DTC <itsmattan@risedtc.com>",
    reply_to: "mattan@risedtc.com",
    btnBg: "#ffc71d",
    btnFg: "#111111",
    signoff_name: "Mattan",
    signoff_site: "resources.risedtc.com",
    // Mattan's measured register: warm-loud, light emoji is authentically his.
    reply_prompt: "Run one agent on your numbers today, then reply and tell me what it caught. I read every reply \u{1F642}",
  },
};

async function sendDeliveryEmail(args: { to: string; first_name: string; title: string | null; resource_url: string; brand?: string | null }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "no_resend_key" };
  const b = args.brand ? DELIVERY_BRANDS[args.brand] : undefined;
  // Ivan rulings 2026-08-08: the VISIBLE sender identity is inboundonsteroids.com,
  // never ivanmanfredi.com (no mailbox on that domain receives — ivan@ and login@ both
  // bounced live probes); replies route to his real inbox im@ivanmanfredi.com per his
  // explicit call. RESEND_FROM env deliberately unused (retired sender identity).
  // Buyer-facing brand = INBOUNDONSTEROIDS (Ivan ruling 08-08: the visible identity is
  // the business brand, "Ivan Manfredi" as a sender name is retired too).
  const from = b ? b.from : "Ivan from InboundOnSteroids <ivan@inboundonsteroids.com>";
  const reply_to = b ? b.reply_to : "im@ivanmanfredi.com";
  const btnBg = b ? b.btnBg : "#4C6E3D";
  const btnFg = b ? b.btnFg : "#F7F4EF";
  const signName = b ? b.signoff_name : "Ivan";
  const signSite = b ? b.signoff_site : "inboundonsteroids.com";
  const replyPrompt = b ? b.reply_prompt : "When you've run it, hit reply and tell me what you'd want it to do next. I read every reply.";
  const first = (args.first_name || "there").trim() || "there";
  const title = args.title || "the resource";
  const subject = title;
  // Branded header band: text-only wordmark (no images = nothing to block, nothing in
  // spam filters' image heuristics). Copy register per brand; kept short on purpose.
  const header = b
    ? '<div style="background:#111111;border-radius:12px;padding:14px 18px;margin-bottom:22px"><span style="font-family:Arial,sans-serif;font-weight:800;font-size:15px;letter-spacing:.06em;color:#ffc71d">RISE DTC</span></div>'
    : '<div style="border-bottom:3px solid #4C6E3D;padding:0 0 12px;margin-bottom:22px"><span style="display:inline-block;background:#1A1A1A;color:#F7F4EF;font-weight:800;font-size:13px;padding:5px 10px;border-radius:4px;letter-spacing:.08em">INBOUNDONSTEROIDS</span></div>';
  const opener = b
    ? "Good call \u{1F64C} " + escapeHtml(title) + " is yours:"
    : escapeHtml(title) + ", as promised:";
  const linkFallback = b
    ? "If the button misbehaves, direct link:"
    : "If the button doesn't work, here's the direct link:";
  const footer = b
    ? '<p style="margin:26px 0 0;font-size:16px">' + escapeHtml(signName) + '</p><p style="margin:2px 0 0;font-size:13px;color:#8a8578">RISE DTC &middot; ' + escapeHtml(signSite) + "</p>"
    : '<p style="margin:26px 0 0;font-size:16px">' + escapeHtml(signName) + '</p><p style="margin:2px 0 0;font-size:13px;color:#8a8578">' + escapeHtml(signSite) + "</p>";
  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1A1A1A;max-width:520px;padding:8px 0">' +
    header +
    "<p style=\"margin:0 0 14px\">Hey " + escapeHtml(first) + ",</p>" +
    '<p style="margin:0 0 6px">' + opener + "</p>" +
    '<p style="margin:18px 0"><a href="' + escapeAttr(args.resource_url) + '" style="display:inline-block;background:' + btnBg + ";color:" + btnFg + ';text-decoration:none;font-weight:700;font-size:16px;padding:13px 26px;border-radius:' + (b ? "999px" : "8px") + '">Open it &rarr;</a></p>' +
    '<p style="margin:0 0 18px;font-size:13px;color:#8a8578">' + linkFallback + '<br><a href="' + escapeAttr(args.resource_url) + '" style="color:#5b574e">' + escapeHtml(args.resource_url) + "</a></p>" +
    '<p style="margin:0">' + escapeHtml(replyPrompt) + "</p>" +
    footer +
    "</div>";
  const text = "Hey " + first + ",\n\n" + (b ? "Good call \u{1F64C} " + title + " is yours:" : title + ", as promised:") + "\n" + args.resource_url + "\n\n" + replyPrompt + "\n\n" + signName + "\n" + (b ? "RISE DTC · " : "") + signSite;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: args.to, subject, html, text, reply_to }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j?.message || ("http_" + r.status) };
    return { ok: true, id: j?.id };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: CORS });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: CORS }); }

  const event_type = String(payload.event_type || "").toLowerCase();
  const lm_slug = String(payload.lm_slug || "").trim();
  if (!VALID_EVENTS.has(event_type)) return new Response(JSON.stringify({ error: "invalid_event_type" }), { status: 400, headers: CORS });
  if (!lm_slug) return new Response(JSON.stringify({ error: "missing_lm_slug" }), { status: 400, headers: CORS });

  let lm_id: string | null = null;
  let lm_title: string | null = null;
  let lm_format: string | null = null;
  let lm_client: string | null = null;
  const { data: lm } = await supabase.from("lead_magnets").select("id, title, format, client_id").eq("slug", lm_slug).limit(1).maybeSingle();
  if (lm) { lm_id = lm.id; lm_title = lm.title ?? null; lm_format = lm.format ?? null; lm_client = lm.client_id ?? null; }
  // Auto-register (W-B.1, 2026-07-10): a live page that beacons but has no
  // lead_magnets row registers itself, so telemetry can never go blind again.
  // Guard: only when the slug maps to a real lm_drafts_v2 row (blocks junk slugs).
  if (!lm) {
    try {
      const { data: draft } = await supabase.from("lm_drafts_v2").select("topic, format, client_id").eq("slug", lm_slug).limit(1).maybeSingle();
      if (draft) {
        // R2 (2026-07-23): carry the draft's tenancy into the auto-registered row
        // (an unstamped row reads as Ivan-owned to the comment gate) and build the
        // page URL from the beaconing page's own allowed origin, not Ivan's domain.
        const evOrigin = req.headers.get("origin") ?? "";
        const pageBase = ALLOWED_ORIGINS.has(evOrigin) && evOrigin.startsWith("https://resources.") ? evOrigin : "https://resources.ivanmanfredi.com";
        const { data: created } = await supabase.from("lead_magnets")
          .insert({ slug: lm_slug, title: draft.topic ?? lm_slug, topic: draft.topic ?? null, format: draft.format ?? null, status: "published", client_id: draft.client_id ?? null, resource_page_url: pageBase + "/" + lm_slug + "/" })
          .select("id, title, format, client_id").single();
        if (created) { lm_id = created.id; lm_title = created.title ?? null; lm_format = created.format ?? null; lm_client = created.client_id ?? null; }
      }
    } catch (_) { /* fail-soft: the event still records slug-keyed */ }
  }

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "";
  const ua = req.headers.get("user-agent") || "";
  const ref = req.headers.get("referer") || "";
  // ip_hash salt (2026-09-02, inbound-engine P3 item 2): was sha256(ip + ":" + lm_slug),
  // salted PER SLUG, so the same visitor produced a different hash on every page — useless
  // as a cross-page dedupe key (see lm-optins-were-all-test-traffic-2026-08-05 memory).
  // Now one global server-side pepper (LM_IP_SALT env secret) so the same IP hashes the
  // same across every slug. Still a secondary/abuse signal only, never the primary identity
  // — session_id (readerIdentity(), P3 item 1) is the first-party identity now.
  const IP_SALT = Deno.env.get("LM_IP_SALT") || "lm-global-v2";
  const ip_hash = ip ? (await sha256Hex(ip + ":" + IP_SALT)).slice(0, 32) : null;

  const email = payload.email ? String(payload.email).toLowerCase().trim() : null;
  const utm = (payload.utm && typeof payload.utm === "object") ? payload.utm : null;
  // Scalar UTM persistence (P0.2 attribution, 2026-07-17): the dedicated utm_source/medium/
  // campaign/term/content columns existed but were never written — every emitter's tags died
  // in the jsonb, so lm_events had NULL utm_source on all rows. Accept the nested utm object
  // (what the _engine templates send) and flat payload keys (utm_source, ...) as fallback.
  const utmScalar = (k: string): string | null => {
    const nested = utm ? (utm as Record<string, unknown>)[k] : null;
    const flat = (payload as Record<string, unknown>)["utm_" + k];
    const v = nested ?? flat;
    return v ? String(v).slice(0, 120) : null;
  };
  const utm_source = utmScalar("source");
  const utm_medium = utmScalar("medium");
  const utm_campaign = utmScalar("campaign");
  const utm_term = utmScalar("term");
  const utm_content = utmScalar("content");
  // session_id: canonicalBeaconEvent() has always SENT it; persistence is new. calendly-webhook
  // (W-B.2) joins lm_attribution.cta_click_event_id on lm_events.session_id + event_type.
  const session_id = payload.session_id ? String(payload.session_id).slice(0, 80) : null;
  const answers = (payload.answers && typeof payload.answers === "object") ? payload.answers : null;
  const src = payload.src ? String(payload.src).slice(0, 32) : null;
  // prospect_id is a uuid column. Embed callers pass a company slug (e.g. "paul-atkinson-45"),
  // not a uuid — inserting that crashed the event with a 22P02 invalid-uuid 500 and silently
  // dropped every embed view/complete event. Coerce non-uuid values to null so the event records.
  const _rawPid = payload.prospect_id ? String(payload.prospect_id) : null;
  const prospect_id = (_rawPid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(_rawPid)) ? _rawPid : null;
  // is_test (2026-08-05): the column existed since the table was created but was never
  // written, so every QA run, Playwright sweep and self-test counted as real traffic —
  // the client board read 60 "opt-ins" that were all ours. Anything flagged here is
  // excluded from the visitor/opt-in counts the board renders.
  // IvanPrerender added 2026-09-02 (P3 item 5): personal-site's build-time prerender
  // script (scripts/prerender.mjs) drives a real headless Chromium against scan-report
  // routes that embed a live assessment/score LM tool, so every site deploy actually
  // fires that tool's beacon for real. It self-identifies with a custom UA that slipped
  // past the existing bot regex (no "bot"/"crawler"/"Playwright" substring in
  // "IvanPrerender/1.0") — confirmed at `personal-site/scripts/prerender.mjs:291`, was
  // inflating several retired/private LM slugs by 1,000-2,800+ uncounted rows each.
  // Skeptic fix pass (2026-09-02, P3): src="ci_smoke" and any other "*smoke*" src tag
  // were NOT excluded -- a POST from a plain browser UA with src=ci_smoke landed
  // is_test=false. Live-confirmed leak: 6 historical rows (UA="node", 2026-07-25
  // through 2026-09-01) counted as 75% of the "honest 60d funnel" views=8 headline.
  // Also flags bare Node/undici HTTP-client UAs (curl\/ and python-requests were
  // already covered, but Node's fetch/undici default UA -- "node" or "node/x.y.z" or
  // "undici" -- was not).
  const is_test =
    /HeadlessChrome|Playwright|puppeteer|curl\/|python-requests|bot|crawler|spider|IvanPrerender/i.test(ua) ||
    /^node(\/|$)/i.test(ua) ||
    /^undici/i.test(ua) ||
    (!!email && /@(ivanmanfredi\.com|intelligents\.agency|example\.com|brand\.com)$|^ivan\.manfredi2001(\+|@)/i.test(email)) ||
    (!!src && (/^(e2e|e2e-test|self-test|selftest|pipeline-test|skeptic_probe|probe|ci_smoke)$/i.test(src) || /smoke/i.test(src))) ||
    (req.headers.get("origin") ?? "").startsWith("http://localhost");
  const linkedin_url = normalizeLinkedInUrl(payload.linkedin_url ? String(payload.linkedin_url) : null);
  const data_version = (typeof payload.data_version === "number" && Number.isFinite(payload.data_version) && payload.data_version >= 1)
    ? Math.floor(payload.data_version)
    : 1;

  if (linkedin_url) {
    try { await supabase.from("lm_prospect_enrichment").upsert({ linkedin_url, source: "unipile", enrichment_status: "pending" }, { onConflict: "linkedin_url", ignoreDuplicates: true }); } catch (_) {}
  }

  const { data: ev, error: ev_err } = await supabase.from("lm_events").insert({
    lm_id, lm_slug, event_type, email, prospect_id, src, utm, answers,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content, session_id, is_test,
    referrer: ref || (payload.referrer as string | null) || null,
    user_agent: ua, ip_hash, linkedin_url, data_version,
  }).select("id").single();
  if (ev_err) return new Response(JSON.stringify({ error: "insert_failed", detail: ev_err.message }), { status: 500, headers: CORS });

  let nurture_result: any = null;

  if (event_type === "complete" && answers) {
    const res = {
      assessment_slug: lm_slug, email, prospect_id,
      persona: (payload.persona as string) || null,
      overall_score: typeof payload.overall_score === "number" ? payload.overall_score : null,
      tier: (payload.tier as string) || null,
      per_category: (payload.per_category && typeof payload.per_category === "object") ? payload.per_category : null,
      answers,
      weakest_category: (payload.weakest_category as string) || null,
      utm, referrer: ref || null, user_agent: ua, linkedin_url,
      data_version,
    };
    await supabase.from("assessment_results").insert(res);

    if (email) {
      const seq_id = await pickSequence(supabase, lm_format || "", "complete");
      if (seq_id) {
        let enrichment: any = null;
        if (linkedin_url) {
          const { data: e } = await supabase.from("lm_prospect_enrichment").select("first_name, last_name, full_name, current_company, current_title, company_size_band, industry, location, enrichment_status").eq("linkedin_url", linkedin_url).maybeSingle();
          enrichment = e || null;
        }
        nurture_result = await enqueueSequence(supabase, {
          sequence_id: seq_id, email, lm_slug, lm_title,
          custom_fields: {
            overall_score: payload.overall_score ?? null, tier: payload.tier ?? null,
            weakest_category: payload.weakest_category ?? null, persona: payload.persona ?? null,
            lm_slug, lm_title, linkedin_url, enrichment,
          },
        });
      }
    }
  }

  if (event_type === "capture") {
    if (lm_id) {
      const { data: current } = await supabase.from("lead_magnets").select("download_count").eq("id", lm_id).single();
      const next = (current?.download_count ?? 0) + 1;
      await supabase.from("lead_magnets").update({ download_count: next }).eq("id", lm_id);
    }

    if (email) {
      const leaf_template_key = (answers && typeof (answers as any).leaf_template_key === "string")
        ? (answers as any).leaf_template_key as string
        : (typeof payload.leaf_template_key === "string" ? payload.leaf_template_key as string : "");
      let seq_id: string | null = null;
      if (leaf_template_key) {
        seq_id = await pickSequenceByLeafTemplate(supabase, leaf_template_key);
      }
      // R1B (2026-07-22): captures from client-tenant pages (payload.client_id, stamped by
      // shared.js when data.client.id is set) route ONLY via leaf-keyed client sequences.
      // No leaf match (e.g. per-LM sequence not yet armed) = enqueue nothing — a client's
      // lead must never fall back into Ivan's format-routed nurture. Ivan/legacy traffic
      // sends no client_id and keeps the format fallback unchanged.
      const cap_client = (typeof payload.client_id === "string" && payload.client_id) ? payload.client_id as string : null;
      if (!seq_id && !cap_client) {
        seq_id = await pickSequence(supabase, lm_format || "", "capture");
      }
      if (seq_id) {
        // Captured name (gate forms send answers.name) → first word for the greeting merge tag.
        const rawName = (answers && typeof (answers as any).name === "string") ? (answers as any).name as string : "";
        const first_name = rawName.trim().split(/\s+/)[0] || null;
        nurture_result = await enqueueSequence(supabase, {
          sequence_id: seq_id, email, lm_slug, lm_title,
          custom_fields: { lm_slug, lm_title, linkedin_url, leaf_template_key },
          first_name,
        });
      }
    }
  }

  if (event_type === "landing_capture") {
    if (!email) return new Response(JSON.stringify({ error: "missing_email" }), { status: 400, headers: CORS });
    const first_name = payload.first_name ? String(payload.first_name).trim().split(/\s+/)[0] || null : null;
    const { url: resource_url, title } = await resolveResource(supabase, lm_slug);
    let delivery: { ok: boolean; id?: string; error?: string };
    if (!resource_url) {
      delivery = { ok: false, error: "no_resource_url_for_slug" };
    } else {
      delivery = await sendDeliveryEmail({ to: email, first_name: first_name || "there", title: title || lm_title, resource_url, brand: lm_client });
    }
    if (lm_id) {
      const { data: current } = await supabase.from("lead_magnets").select("download_count").eq("id", lm_id).single();
      const next = (current?.download_count ?? 0) + 1;
      await supabase.from("lead_magnets").update({ download_count: next }).eq("id", lm_id);
    }
    // The plugin guide delivers access immediately. Its follow-up copy is still
    // under review, so do not enroll these readers in the legacy automation series.
    if (lm_slug === "content-brain-guide") {
      return new Response(JSON.stringify({ ok: true, event_id: ev?.id ?? null, delivery,
        nurture: { skipped: true, reason: "plugin_guide_delivery_only" } }), { status: 200, headers: CORS });
    }
    // Nurture follow-up (separate from the instant delivery email). Same R1B tenancy rule
    // as `capture`: a client-tenant lead routes ONLY via leaf-keyed sequences and must
    // never fall back into Ivan's format-routed nurture.
    const leaf_template_key = typeof payload.leaf_template_key === "string" ? payload.leaf_template_key as string : "";
    let seq_id: string | null = null;
    if (leaf_template_key) seq_id = await pickSequenceByLeafTemplate(supabase, leaf_template_key);
    if (!seq_id && !lm_client) seq_id = await pickSequence(supabase, lm_format || "", "capture");
    if (seq_id && email) {
      nurture_result = await enqueueSequence(supabase, {
        sequence_id: seq_id, email, lm_slug, lm_title,
        custom_fields: { lm_slug, lm_title, first_name, linkedin_url },
        first_name,
      });
    }
    return new Response(JSON.stringify({ ok: true, event_id: ev?.id ?? null, delivery, nurture: nurture_result }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ ok: true, event_id: ev?.id ?? null, nurture: nurture_result }), { status: 200, headers: CORS });
});
