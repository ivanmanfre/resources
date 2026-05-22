const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://bjbvqvzbzczjbatgmccb.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PROMOTER_URL = Deno.env.get("N8N_PROMOTER_WEBHOOK_URL") || "https://n8n.ivanmanfredi.com/webhook/lm-curator-promote";

const VALID = new Set(["approve","reject","defer","revert","rescue"]);

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    "Content-Type": "application/json",
  };
}

async function pg(path: string, init: RequestInit): Promise<Response> {
  return await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors() });
  }
  let body: { candidate_id?: string; decision?: string; reason?: string; edited_topic?: string } = {};
  try { body = await req.json(); } catch (_) {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400, headers: cors() });
  }
  if (!body.candidate_id || !body.decision) {
    return new Response(JSON.stringify({ error: "missing_fields" }), { status: 400, headers: cors() });
  }
  if (!VALID.has(body.decision)) {
    return new Response(JSON.stringify({ error: "invalid_decision" }), { status: 400, headers: cors() });
  }
  try {
    // Fetch candidate
    const cRes = await pg("lm_idea_candidates?id=eq." + body.candidate_id + "&select=*", { method: "GET" });
    if (!cRes.ok) throw new Error("fetch_candidate:" + cRes.status);
    const arr = await cRes.json();
    if (!Array.isArray(arr) || arr.length === 0) {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: cors() });
    }
    const cand = arr[0];

    // Apply optional edited_topic
    const rawTopic = body.edited_topic ? body.edited_topic.slice(0, 280) : cand.raw_topic;

    // Compute next status
    let nextStatus = cand.status as string;
    let archivedReason: string | null = cand.archived_reason || null;
    let promotedTaskId: string | null = null;

    if (body.decision === "approve") {
      // Fire promoter webhook
      const wh = await fetch(PROMOTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: cand.id,
          raw_topic: rawTopic,
          why_score: cand.why_score || "",
          format: cand.format_recommendation || "guide",
          evidence: cand.evidence,
        }),
      });
      const whJson = await wh.json().catch(() => ({}));
      if (!wh.ok || !whJson.ok) throw new Error("promoter_failed:" + wh.status);
      promotedTaskId = whJson.clickup_task_id || null;
      nextStatus = "promoted";
    } else if (body.decision === "reject") {
      nextStatus = "archived";
      archivedReason = "ivan_rejected" + (body.reason ? ":" + body.reason.slice(0, 200) : "");
    } else if (body.decision === "defer") {
      nextStatus = "reviewing";
    } else if (body.decision === "revert") {
      nextStatus = "archived";
      archivedReason = "ivan_reverted";
      // (Optional) close the ClickUp task — left manual for Phase A. Logged in decision.
    } else if (body.decision === "rescue") {
      nextStatus = "reviewing";
      archivedReason = null;
    }

    const patch: Record<string, unknown> = { status: nextStatus, archived_reason: archivedReason };
    if (body.edited_topic) patch.raw_topic = rawTopic;
    if (promotedTaskId) patch.promoted_clickup_task_id = promotedTaskId;
    const updRes = await pg("lm_idea_candidates?id=eq." + body.candidate_id, {
      method: "PATCH", body: JSON.stringify(patch),
    });
    if (!updRes.ok) throw new Error("update_candidate:" + updRes.status);

    // Log the decision
    const decRes = await pg("lm_idea_review_decisions", {
      method: "POST",
      body: JSON.stringify({
        candidate_id: cand.id,
        decision: body.decision,
        reason: body.reason || null,
        edited_topic: body.edited_topic || null,
      }),
    });
    if (!decRes.ok) throw new Error("log_decision:" + decRes.status);

    return new Response(JSON.stringify({
      ok: true, candidate_id: cand.id, status: nextStatus, clickup_task_id: promotedTaskId,
    }), { status: 200, headers: cors() });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && (e as Error).message || e) }), {
      status: 502, headers: cors(),
    });
  }
}

if (import.meta.main) Deno.serve(handler);
