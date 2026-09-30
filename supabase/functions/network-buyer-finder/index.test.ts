import { createHandler } from "./index.ts";
function assert(x: unknown, m = "assertion failed") {
  if (!x) throw new Error(m);
}
function eq(a: unknown, b: unknown) {
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `${JSON.stringify(a)} !== ${JSON.stringify(b)}`,
  );
}
const profile = {
  provider_id: "seller-1",
  public_identifier: "owner",
  first_name: "Sam",
  last_name: "Seller",
  headline: "I serve agency owners",
  summary: "Agency owners need my service",
  privacySettings: { allowConnectionsBrowse: true },
};
const criteria = {
  roles: ["owner"],
  businesses: ["agency"],
  exclusions: [],
  locations: [],
  summary: "Agency owners",
  evidence: ["Agency owners"],
};
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: {
    profile: number;
    model: number;
    search: number;
    quota: number;
    consume: number;
  } = { profile: 0, model: 0, search: 0, quota: 0, consume: 0 };
  let saved: Record<string, unknown> | null = null;
  const deps = {
    secret: "test-secret",
    getProfile: async () => {
      calls.profile++;
      return profile;
    },
    inferCriteria: async () => {
      calls.model++;
      return criteria;
    },
    search: async (id: string) => {
      calls.search++;
      return {
        config: { params: { connections_of: [id] } },
        items: Array.from(
          { length: 15 },
          (_, i) => ({
            id: `person-${i}`,
            name: `Person ${i}`,
            headline: "Owner",
            public_profile_url: `https://linkedin.com/in/person-${i}`,
          }),
        ),
        paging: { total_count: 300 },
        cursor: "next",
      };
    },
    claim: async () => {
      calls.quota++;
    },
    save: async (x: Record<string, unknown>) => {
      saved = x;
    },
    consume: async () => {
      calls.consume++;
      const x = saved;
      saved = null;
      return x;
    },
    ...overrides,
  };
  const handler = createHandler(deps as never);
  const request = (
    body: unknown,
    origin = "https://resources.ivanmanfredi.com",
  ) =>
    handler(
      new Request("https://example.com", {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.5",
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  return { calls, request, handler };
}
const prepare = {
  action: "prepare",
  linkedin_url: "linkedin.com/in/owner",
  buyer_description: "Agency owners need my service",
};
Deno.test("nonstring buyer description is rejected before quota or provider", async () => {
  const f = fixture();
  eq(
    (await f.request({
      ...prepare,
      buyer_description: { text: "agency owners" },
    })).status,
    400,
  );
  eq(f.calls.quota, 0);
  eq(f.calls.profile, 0);
});
Deno.test("rejects origin, unknown action, malformed and oversized body before quota or transport", async () => {
  const f = fixture();
  eq((await f.request(prepare, "https://evil.example")).status, 403);
  eq((await f.request({ action: "other" })).status, 400);
  eq((await f.request("{")).status, 400);
  eq((await f.request("x".repeat(8193))).status, 413);
  eq(f.calls, { profile: 0, model: 0, search: 0, quota: 0, consume: 0 });
});
Deno.test("OPTIONS permits browser headers but POST requires exact canonical origin", async () => {
  const f = fixture();
  const res = await f.handler(
    new Request("https://example.com", {
      method: "OPTIONS",
      headers: { Origin: "https://resources.ivanmanfredi.com" },
    }),
  );
  eq(res.status, 204);
  assert(
    (res.headers.get("Access-Control-Allow-Headers") || "").includes("apikey"),
  );
  eq(
    (await f.request(prepare, "https://resources.ivanmanfredi.com.evil.test"))
      .status,
    403,
  );
});
Deno.test("wrong public identifier and hidden connections stop before model/session", async () => {
  for (
    const p of [{ ...profile, public_identifier: "someone-else" }, {
      ...profile,
      privacySettings: { allowConnectionsBrowse: false },
    }]
  ) {
    const f = fixture({ getProfile: async () => p });
    const r = await f.request(prepare);
    eq(r.status, 400);
    eq(f.calls.model, 0);
    eq(f.calls.search, 0);
  }
});
Deno.test("unsupported criterion evidence is rejected and never saved", async () => {
  let saved = false;
  const f = fixture({
    inferCriteria: async () => ({ ...criteria, evidence: ["I made this up"] }),
    save: async () => {
      saved = true;
    },
  });
  eq((await f.request(prepare)).status, 400);
  eq(saved, false);
});
Deno.test("prepare and scan return existing shape, one page and consume once", async () => {
  const f = fixture();
  const p = await (await f.request(prepare)).json();
  eq(p.status, "confirm_buyer");
  eq(p.criteria, criteria);
  assert(typeof p.scan_id === "string");
  const s = await (await f.request({ action: "scan", scan_id: p.scan_id }))
    .json();
  eq(s.status, "complete");
  eq(s.rows.length, 10);
  eq(s.coverage.scanned, 10);
  eq(s.coverage.reportedTotal, 300);
  eq(s.coverage.complete, false);
  eq(f.calls.search, 1);
  eq((await f.request({ action: "scan", scan_id: p.scan_id })).status, 400);
  eq(f.calls.search, 1);
});
Deno.test("scope echo must match exactly before rows are released", async () => {
  for (const scope of [undefined, [], ["seller-1", "another"], ["another"]]) {
    const f = fixture({
      search: async () => ({
        config: { params: { connections_of: scope } },
        items: [{ id: "private", name: "Private Person" }],
      }),
    });
    const p = await (await f.request(prepare)).json();
    const r = await f.request({ action: "scan", scan_id: p.scan_id });
    eq(r.status, 400);
    assert(!(await r.text()).includes("Private Person"));
  }
});
Deno.test("malformed proxy output and timeout produce safe errors", async () => {
  for (
    const error of [
      new Error("proxy returned malformed JSON with private name"),
      new DOMException("timed out", "TimeoutError"),
    ]
  ) {
    const f = fixture({
      inferCriteria: async () => {
        throw error;
      },
    });
    const r = await f.request(prepare);
    eq(r.status, 503);
    assert(!(await r.text()).includes("private name"));
  }
});
Deno.test("Claude transport sends only seller source and rejects malformed JSON", async () => {
  const { inferCriteriaTransport } = await import("./index.ts");
  Deno.env.set("NETWORK_BUYER_PROXY_URL", "https://proxy.invalid/messages");
  Deno.env.set("NETWORK_BUYER_PROXY_KEY", "test");
  const original = globalThis.fetch;
  let payload: any = null;
  try {
    globalThis.fetch = async (_input, init) => {
      payload = JSON.parse(String((init as RequestInit)?.body));
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "not JSON" }] }),
        { status: 200 },
      );
    };
    let rejected = false;
    try {
      await inferCriteriaTransport(profile, "Agency owners need my service");
    } catch {
      rejected = true;
    }
    assert(rejected);
    eq(payload?.model, "claude-sonnet-5");
    assert(JSON.stringify(payload).includes("Agency owners need my service"));
    assert(!JSON.stringify(payload).includes("person-0"));
    globalThis.fetch = async () => {
      throw new DOMException("timed out", "TimeoutError");
    };
    rejected = false;
    try {
      await inferCriteriaTransport(profile, "Agency owners need my service");
    } catch {
      rejected = true;
    }
    assert(rejected);
  } finally {
    globalThis.fetch = original;
  }
});
