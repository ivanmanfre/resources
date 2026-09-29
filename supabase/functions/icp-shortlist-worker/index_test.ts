import { handler, parseBrief, reportCompany } from './index.ts';
function assert(ok: unknown, message = 'assertion failed'): asserts ok { if (!ok) throw new Error(message); }
const id = '00000000-0000-4000-8000-000000000001';
const lease = '00000000-0000-4000-8000-000000000002';
const environment: Record<string, string> = { ICP_SHORTLIST_SECRET: 'test-worker-secret', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', RESEND_API_KEY: 'test-resend', RESEND_FROM: 'Research <research@example.com>', GEMINI_API_KEY: 'test-gemini', FIRECRAWL_API_KEY: 'test-firecrawl' };
function job(extra: Record<string, unknown> = {}) { return { id, lease_id: lease, phase: 'deliver', attempts: 1, email: 'owner@example.com', review_required: false, state: {}, report: { companies: [], summary: 'No candidates passed the evidence checks.' }, email_status: 'pending', ...extra }; }
function request(body = '{}', secret = 'test-worker-secret') { return new Request('https://worker.example', { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body }); }
async function mock<T>(fetcher: typeof fetch, run: () => Promise<T>) {
  const original = globalThis.fetch, previous = Object.fromEntries(Object.keys(environment).map(k => [k, Deno.env.get(k)]));
  globalThis.fetch = fetcher;
  for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value);
  try { return await run(); } finally { globalThis.fetch = original; for (const [key, value] of Object.entries(previous)) value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value); }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
Deno.test('brief keeps a strict string contract but bounds valid long summaries', () => {
  const brief = { agency: 'Agency', reference: 'Reference', target: 'A'.repeat(6000), service: 'Content', queries: ['first query', 'second query'], public_clients: [] };
  assert(parseBrief(brief).target.length === 4000);
  let error = ''; try { parseBrief({ ...brief, agency: { name: 'Agency' } }); } catch (e) { error = String(e); }
  assert(error.includes('field agency: expected nonempty string'));
});
Deno.test('brief sends an explicit model schema and privately preserves invalid parsed output', async () => {
  const invalid = { agency: { name: 'Agency' }, reference: 'Reference', target: 'Target', service: 'Content', queries: ['query one', 'query two'], public_clients: [] };
  const writes: Record<string, unknown>[] = [];
  const agency_url = 'https://agency.example/', client_url = 'https://client.example/';
  await mock(async (input, init) => {
    const url = String(input), body = JSON.parse(String((init as RequestInit | undefined)?.body));
    if (url.endsWith('/rpc/icp_shortlist_claim')) return json([job({ phase: 'brief', agency_url, client_url, service: 'Content', state: { evidence: [agency_url, client_url].map(url => ({ url, kind: 'scrape', text: 'Previously scraped public website content.', checked_at: '2026-09-30T00:00:00Z' })) } })]);
    if (url.endsWith('/rpc/icp_shortlist_reserve')) return json(true);
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      assert(body.generationConfig.responseSchema.properties.agency.type === 'STRING');
      assert(body.generationConfig.thinkingConfig.thinkingLevel === 'low');
      assert(body.generationConfig.temperature === undefined);
      return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(invalid) }] } }] });
    }
    writes.push(body); return json([{ id }]);
  }, async () => { await handler(request()); });
  const state = writes[0].state as Record<string, unknown>;
  assert(JSON.stringify(state.brief_error_response) === JSON.stringify(invalid));
  assert(writes[0].report === undefined && writes[1].status === 'queued');
  assert(String(writes[1].error).includes('field agency'));
});
Deno.test('rejects unauthenticated and malformed worker input before any external request', async () => {
  await mock(() => { throw new Error('Unexpected external request'); }, async () => {
    assert((await handler(request('{}', 'wrong'))).status === 401);
    assert((await handler(request('{"id":"not-a-uuid"}'))).status === 400);
  });
});
Deno.test('an empty queue is a no-op', async () => {
  await mock(async () => json([]), async () => { const response = await handler(request()); assert((await response.json()).claimed === false); });
});
Deno.test('review hold does not call email provider, and lease guards all writes', async () => {
  const writes: Record<string, unknown>[] = [];
  await mock(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/rpc/icp_shortlist_claim')) return json([job({ review_required: true })]);
    assert(url.includes(`id=eq.${id}&lease_id=eq.${lease}&lease_until=gt.`));
    writes.push(JSON.parse(String((init as RequestInit | undefined)?.body))); return json([{ id }]);
  }, async () => { assert((await handler(request())).status === 200); });
  assert(writes.length === 1 && writes[0].status === 'pending_review');
  assert(writes[0].lease_id === null && writes[0].attempts === 0);
});
Deno.test('email is idempotent, references persisted report, and sent status precedes completion', async () => {
  const writes: Record<string, unknown>[] = []; let emails = 0;
  await mock(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/rpc/icp_shortlist_claim')) return json([job()]);
    if (url === 'https://api.resend.com/emails') {
      emails++; assert(new Headers((init as RequestInit | undefined)?.headers).get('Idempotency-Key') === `icp-shortlist/${id}`);
      const body = JSON.parse(String((init as RequestInit | undefined)?.body));
      assert(body.to[0] === 'owner@example.com');
      assert(/report\.html#[a-f0-9]{64}/.test(body.text));
      return json({ id: 'email-id' });
    }
    assert(url.includes(`lease_id=eq.${lease}`)); writes.push(JSON.parse(String((init as RequestInit | undefined)?.body))); return json([{ id }]);
  }, async () => { await handler(request()); });
  assert(emails === 1 && writes[0].email_status === 'sent' && writes[0].email_id === 'email-id');
  assert(writes[1].status === 'needs_clarification' && writes[1].phase === 'done');
});
Deno.test('already delivered retry completes without emailing twice', async () => {
  await mock(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/rpc/icp_shortlist_claim')) return json([job({ email_status: 'sent' })]);
    assert(url.startsWith('https://db.example/'));
    assert(JSON.parse(String((init as RequestInit | undefined)?.body)).phase === 'done'); return json([{ id }]);
  }, async () => { await handler(request()); });
});
Deno.test('provider outage fails the third attempt without fabricating successful empty research', async () => {
  const writes: Record<string, unknown>[] = [];
  await mock(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/rpc/icp_shortlist_claim')) return json([job({ attempts: 3 })]);
    if (url === 'https://api.resend.com/emails') return json({ error: 'outage' }, 503);
    writes.push(JSON.parse(String((init as RequestInit | undefined)?.body))); return json([{ id }]);
  }, async () => { await handler(request()); });
  assert(writes.length === 1 && writes[0].status === 'failed');
  assert(writes[0].error === 'Resend returned 503' && writes[0].lease_id === null);
});
Deno.test('optional LinkedIn scrape 403 falls back to receipts; credential and outage errors retry', async () => {
  for (const status of [403, 401, 503]) {
    const writes: Record<string, unknown>[] = []; let modelCalls = 0;
    const contact = { url: 'https://www.linkedin.com/in/jane-smith', text: 'Jane Smith, CEO at Acme', kind: 'search', checked_at: '2026-09-30T00:00:00Z' };
    await mock(async (input, init) => {
      const url = String(input), body = JSON.parse(String((init as RequestInit | undefined)?.body));
      if (url.endsWith('/rpc/icp_shortlist_claim')) return json([job({ phase: 'research', service: 'Content', state: { candidates: [{ name: 'Acme', website: 'https://acme.example/' }], companies: [], index: 0, active: { home_done: true, page_done: true, page_results: [], evidence: [] } } })]);
      if (url.endsWith('/rpc/icp_shortlist_reserve')) return json(true);
      if (url === 'https://api.firecrawl.dev/v2/search') {
        assert(body.query === '"Acme" (founder OR CEO OR "chief executive officer") site:linkedin.com/in');
        return json({ success: true, data: { web: [{ url: contact.url, title: contact.text, description: '' }] } });
      }
      if (url === 'https://api.firecrawl.dev/v2/scrape') return json({ error: 'Unavailable' }, status);
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        modelCalls++;
        assert(body.contents[0].parts[0].text.includes(contact.text));
        return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"eligible":false,"reason":"Insufficient opportunity evidence"}' }] } }] });
      }
      writes.push(body); return json([{ id }]);
    }, async () => { await handler(request()); });
    const last = writes.at(-1)!;
    if (status === 403) { assert(modelCalls === 1); assert(last.phase === 'finalize' && last.attempts === 0 && last.error === null); }
    else { assert(modelCalls === 0); assert(last.status === 'queued' && last.phase === undefined && last.error === `Firecrawl returned ${status}`); }
  }
});
Deno.test('candidate schema enforces nested objects and malformed draft is retained privately after rejection', async () => {
  const malformed = { eligible: true, company: { name: 'Acme', finding: 'a model string instead of an object' } };
  const writes: Record<string, unknown>[] = [];
  await mock(async (input, init) => {
    const url = String(input), body = JSON.parse(String((init as RequestInit | undefined)?.body));
    if (url.endsWith('/rpc/icp_shortlist_claim')) return json([job({ phase: 'research', service: 'Content', state: { candidates: [{ name: 'Acme', website: 'https://acme.example/' }], index: 0, companies: [], active: { home_done: true, page_done: true, page_results: [], contacts: [], contact_done: true, evidence: [] } } })]);
    if (url.endsWith('/rpc/icp_shortlist_reserve')) return json(true);
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      const schema = body.generationConfig.responseSchema;
      assert(schema.required.includes('company'));
      assert(schema.properties.company.properties.finding.type === 'OBJECT');
      assert(schema.properties.company.properties.contact.type === 'OBJECT');
      assert(schema.properties.company.properties.contact.properties.current_role.type === 'BOOLEAN');
      return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(malformed) }] } }] });
    }
    writes.push(body); return json([{ id }]);
  }, async () => { await handler(request()); });
  const final = writes.at(-1)!;
  const state = final.state as { skipped: { reason: string; draft: unknown }[]; active?: unknown; companies: unknown[] };
  assert(state.skipped[0].reason === 'Expected company.finding object');
  assert(JSON.stringify(state.skipped[0].draft) === JSON.stringify(malformed));
  assert(state.active === undefined && state.companies.length === 0 && final.report === undefined);
});
Deno.test('critic receives only valid fit receipts and discarded receipts stay in private audit', async () => {
  const source = { url: 'https://acme.example/product', text: 'Acme makes scheduling software for dentists. Used by independent dental practices. Book a 45 minute demo with our sales team.', kind: 'scrape', checked_at: '2026-09-30T00:00:00Z' };
  const contact = { url: 'https://www.linkedin.com/in/jane-smith', text: 'Jane Smith, Chief Executive Officer at Acme', kind: 'search', checked_at: source.checked_at };
  const invalid = { url: source.url, quote: 'An invented extra matching claim that was never sourced.' };
  const company = { name: 'Acme', website: 'https://acme.example/', fit: 'Dental scheduling software used by independent practices.', fit_sources: [{ url: source.url, quote: 'Acme makes scheduling software for dentists.' }, { url: source.url, quote: 'Used by independent dental practices.' }, invalid], finding: { title: 'A 45 minute demo', observation: 'The page asks visitors to book a 45 minute demo.', kind: 'observation', source_url: source.url, quote: 'Book a 45 minute demo with our sales team.', agency_help: 'Make a short walkthrough of that demo.' }, contact: { name: 'Jane Smith', role: 'Chief Executive Officer', linkedin_url: contact.url, source_url: contact.url, quote: contact.text, current_role: true, email: null }, message: 'Jane, your page offers a 45 minute demo. Could I send a short outline for a two minute walkthrough of that flow?' };
  const writes: Record<string, unknown>[] = [];
  await mock(async (input, init) => {
    const url = String(input), body = JSON.parse(String((init as RequestInit | undefined)?.body));
    if (url.endsWith('/rpc/icp_shortlist_claim')) return json([job({ phase: 'research', service: 'Product videos', state: { candidates: [{ name: company.name, website: company.website }], index: 0, companies: [], active: { home_done: true, page_done: true, page_results: [], contacts: [], contact_done: true, evidence: [source, contact], draft: { eligible: true, company } } } })]);
    if (url.endsWith('/rpc/icp_shortlist_reserve')) return json(true);
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      const text = body.contents[0].parts[0].text;
      const proposed = JSON.parse(text.split('INPUT_DATA:\n')[1]).proposed;
      assert(proposed.fit_sources.length === 2 && !JSON.stringify(proposed).includes(invalid.quote));
      assert(text.includes('two distinct matching details'));
      return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"approved":true,"reason":"Two matching details and concrete observed demo flow"}' }] } }] });
    }
    writes.push(body); return json([{ id }]);
  }, async () => { await handler(request()); });
  const state = writes.at(-1)!.state as { fit_audit: { discarded: { receipt: unknown; reason: string }[] }[]; companies: { fit_sources: unknown[] }[] };
  assert(JSON.stringify(state.fit_audit[0].discarded[0].receipt) === JSON.stringify(invalid));
  assert(state.companies[0].fit_sources.length === 2 && !JSON.stringify(state.companies).includes(invalid.quote));
});

Deno.test('published excerpts stay short per source while private receipts remain intact', () => {
  const text = Array.from({length:40},(_,i)=>`word${i}`).join(' ');
  const company = {finding:{source_url:'https://example.com',quote:text},fit_sources:[{url:'https://example.com',quote:text},{url:'https://example.com',quote:text}]} as Parameters<typeof reportCompany>[0];
  const output=reportCompany(company);
  const words=[output.finding.quote,...output.fit_sources.map(s=>s.quote)].reduce((n,q)=>n+q.split(/\s+/).length,0);
  assert(words<=25);assert(company.finding.quote===text);assert(output.finding.source_url===company.finding.source_url);
});
