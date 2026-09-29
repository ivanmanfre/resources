import { pg, publicUrl, reportToken } from '../_shared/icp-shortlist/core.ts';
import { type Company, type DiscardedFit, type Evidence, domain, emailIsVerified, publicPersonEmail, record, RESEARCH_SYSTEM, str, validateCompany } from '../_shared/icp-shortlist/research.ts';

type Candidate = { name: string; website: string };
type Brief = { agency: string; reference: string; target: string; service: string; queries: string[]; public_clients: string[] };
type Active = { evidence: Evidence[]; home_done?: boolean; page_results?: Evidence[]; page_done?: boolean; contacts?: Evidence[]; contact_done?: boolean; draft?: unknown; reviewed?: boolean };
type State = { fit_audit?: { website: string; discarded: DiscardedFit[] }[]; evidence?: Evidence[]; brief?: Brief; brief_error_response?: unknown; searches?: Evidence[][]; candidates?: Candidate[]; index?: number; companies?: Company[]; skipped?: { website: string; reason: string; draft?: unknown }[]; active?: Active; exclusions?: string[] };
type Job = { id: string; lease_id: string; agency_url: string; client_url: string; service: string; email: string; phase: string; attempts: number; review_required: boolean; state: State; report: { companies?: Company[]; summary?: string }; email_status: string; is_test: boolean };
class SourceUnavailable extends Error {}
class BudgetExceeded extends Error {}
class LostLease extends Error {}
const env = (key: string) => { const value = Deno.env.get(key); if (!value) throw new Error(`Missing ${key}`); return value; };
const iso = () => new Date().toISOString();
const BRIEF_SCHEMA = {
  type: 'OBJECT', required: ['agency', 'reference', 'target', 'service', 'queries', 'public_clients'],
  properties: {
    agency: { type: 'STRING', description: 'Plain text agency name and its relevant offer, under 1200 characters.' },
    reference: { type: 'STRING', description: 'Plain text reference business description, under 1200 characters.' },
    target: { type: 'STRING', description: 'Plain text target buyer profile, under 1800 characters.' },
    service: { type: 'STRING', description: 'Plain text selected service and its scope, under 1200 characters.' },
    queries: { type: 'ARRAY', minItems: 2, maxItems: 2, items: { type: 'STRING' }, description: 'Exactly two distinct search queries, each under 300 characters.' },
    public_clients: { type: 'ARRAY', maxItems: 40, items: { type: 'STRING' }, description: 'Explicitly named agency clients only. Empty array if none are evidenced.' },
  },
};
const DISCOVERY_SCHEMA = {
  type: 'OBJECT', required: ['candidates'], properties: {
    candidates: { type: 'ARRAY', maxItems: 8, items: { type: 'OBJECT', required: ['name', 'website'], properties: { name: { type: 'STRING' }, website: { type: 'STRING' } } } },
  },
};
const DRAFT_SCHEMA = {
  type: 'OBJECT', required: ['eligible', 'reason', 'company'], properties: {
    eligible: { type: 'BOOLEAN' }, reason: { type: 'STRING' },
    company: {
      type: 'OBJECT', nullable: true, required: ['name', 'website', 'fit', 'fit_sources', 'finding', 'contact', 'message'], properties: {
        name: { type: 'STRING' }, website: { type: 'STRING' }, fit: { type: 'STRING' }, message: { type: 'STRING' },
        fit_sources: { type: 'ARRAY', minItems: 2, maxItems: 3, items: { type: 'OBJECT', required: ['url', 'quote'], properties: { url: { type: 'STRING' }, quote: { type: 'STRING' } } } },
        finding: { type: 'OBJECT', required: ['title', 'observation', 'kind', 'source_url', 'quote', 'agency_help'], properties: {
          title: { type: 'STRING' }, observation: { type: 'STRING' }, kind: { type: 'STRING', enum: ['observation'] }, source_url: { type: 'STRING' }, quote: { type: 'STRING' }, agency_help: { type: 'STRING' },
        } },
        contact: { type: 'OBJECT', required: ['name', 'role', 'linkedin_url', 'source_url', 'quote', 'current_role', 'email', 'email_quote', 'email_source_url'], properties: {
          name: { type: 'STRING' }, role: { type: 'STRING' }, linkedin_url: { type: 'STRING' }, source_url: { type: 'STRING' }, quote: { type: 'STRING' }, current_role: { type: 'BOOLEAN' }, email: { type: 'STRING', nullable: true }, email_quote: { type: 'STRING', nullable: true }, email_source_url: { type: 'STRING', nullable: true },
        } },
      },
    },
  },
};
const REVIEW_SCHEMA = { type: 'OBJECT', required: ['approved', 'reason'], properties: { approved: { type: 'BOOLEAN' }, reason: { type: 'STRING' } } };
export function parseBrief(result: Record<string, unknown>): Brief {
  const text = (key: string, limit = 4000) => {
    if (typeof result[key] !== 'string' || !result[key].trim()) throw new Error(`Invalid research brief field ${key}: expected nonempty string`);
    return result[key].trim().slice(0, limit);
  };
  if (!Array.isArray(result.queries) || result.queries.length < 2 || result.queries.slice(0, 2).some(q => typeof q !== 'string' || !q.trim())) throw new Error('Invalid research brief queries');
  if (!Array.isArray(result.public_clients) || result.public_clients.some(name => typeof name !== 'string')) throw new Error('Invalid research brief public_clients');
  return { agency: text('agency'), reference: text('reference'), target: text('target'), service: text('service'), queries: result.queries.slice(0, 2).map(q => q.trim().slice(0, 400)), public_clients: result.public_clients.slice(0, 40).map(name => name.trim().slice(0, 160)).filter(Boolean) };
}

/** Keep published source excerpts brief; full receipts remain in private research state. */
export function reportCompany(company: Company): Company {
  const copy = structuredClone(company);
  const pages = new Map<string, { item: { quote: string }; weight: number }[]>();
  for (const part of [{ item: copy.finding, url: copy.finding.source_url, weight: 2 }, ...copy.fit_sources.map(item => ({ item, url: item.url, weight: 1 }))]) {
    const entries = pages.get(part.url) || []; entries.push(part); pages.set(part.url, entries);
  }
  for (const entries of pages.values()) {
    const total = entries.reduce((n, e) => n + e.weight, 0);
    for (const { item, weight } of entries) {
      const words = item.quote.trim().split(/\s+/), limit = Math.floor(25 * weight / total);
      item.quote = words.slice(0, limit).join(' ') + (words.length > limit ? '…' : '');
    }
  }
  return copy;
}

class Runner {
  readonly deadline = Date.now() + 170_000;
  constructor(readonly job: Job) { job.state ||= {}; }
  async save(fields: Record<string, unknown> = {}) {
    const result = await pg(`icp_shortlist_requests?id=eq.${this.job.id}&lease_id=eq.${this.job.lease_id}&lease_until=gt.${encodeURIComponent(iso())}`, {
      method: 'PATCH', signal: AbortSignal.timeout(10000), headers: { Prefer: 'return=representation' }, body: JSON.stringify({ state: this.job.state, updated_at: iso(), ...fields }),
    });
    if (!Array.isArray(result) || result.length !== 1) throw new LostLease('Lease no longer owned');
  }
  async advance(phase: string, fields: Record<string, unknown> = {}) {
    await this.save({ phase, attempts: 0, error: null, status: 'queued', lease_id: null, lease_until: null, next_run_at: iso(), ...fields });
  }
  async reserve(kind: string) {
    if (Date.now() + 2500 >= this.deadline) throw new Error('Phase time limit');
    const ok = await pg('rpc/icp_shortlist_reserve', { method: 'POST', signal: AbortSignal.timeout(Math.min(10000, this.deadline - Date.now() - 1000)), body: JSON.stringify({ p_id: this.job.id, p_lease: this.job.lease_id, p_kind: kind, p_amount: 1 }) });
    if (ok !== true) throw new BudgetExceeded(`Research ${kind} limit reached`);
  }
  async request(url: string, init: RequestInit, provider: string): Promise<Record<string, unknown>> {
    const remaining = this.deadline - Date.now() - 1500;
    if (remaining < 2000) throw new Error('Phase time limit');
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(Math.min(43_000, remaining)) });
    if (!response.ok) {
      // Never expose provider response bodies: they can echo credentials or private inputs.
      if (provider === 'Firecrawl' && ([404, 408, 422].includes(response.status) || (response.status === 403 && url === 'https://api.firecrawl.dev/v2/scrape'))) throw new SourceUnavailable('Public page unavailable');
      throw new Error(`${provider} returned ${response.status}`);
    }
    return record(await response.json());
  }
  async firecrawl(path: string, payload: unknown, kind: 'scrape' | 'search') {
    await this.reserve(kind);
    const body = await this.request(`https://api.firecrawl.dev/v2/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${env('FIRECRAWL_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, 'Firecrawl');
    if (body.success === false) throw new Error('Firecrawl request failed');
    return body;
  }
  async scrape(value: string): Promise<Evidence> {
    const url = publicUrl(value);
    const response = await this.firecrawl('scrape', { url, formats: ['markdown'], maxAge: 0, timeout: 30000 }, 'scrape');
    const data = record(response.data);
    const text = typeof data.markdown === 'string' ? data.markdown.slice(0, 28000) : '';
    if (text.trim().length < 100) throw new SourceUnavailable('Public page contained insufficient text');
    // Validate redirects too. We use only public sources, even when Firecrawl can reach more.
    const metadata = data.metadata && typeof data.metadata === 'object' ? record(data.metadata) : {};
    if (metadata.sourceURL) publicUrl(String(metadata.sourceURL));
    if (metadata.url) publicUrl(String(metadata.url));
    return { url, text, kind: 'scrape', checked_at: iso() };
  }
  async search(query: string, limit = 5): Promise<Evidence[]> {
    const response = await this.firecrawl('search', { query: query.slice(0, 400), limit }, 'search');
    const data = response.data;
    const rows = Array.isArray(data) ? data : record(data).web;
    if (!Array.isArray(rows)) throw new Error('Unexpected Firecrawl search response');
    return rows.flatMap(row => {
      try { const r = record(row), url = publicUrl(str(r.url, 2000)); return [{ url, text: [r.title, r.description, r.markdown].filter(v => typeof v === 'string').join('\n').slice(0, 8000), kind: 'search' as const, checked_at: iso() }]; }
      catch { return []; }
    });
  }
  async model(task: string, data: unknown, responseSchema?: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.reserve('llm');
    const response = await this.request(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: RESEARCH_SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: `${task}\n\nINPUT_DATA:\n${JSON.stringify(data)}` }] }], generationConfig: { responseMimeType: 'application/json', ...(responseSchema ? { responseSchema } : {}), maxOutputTokens: 10000, thinkingConfig: { thinkingLevel: 'low' } } }),
    }, 'Gemini');
    const usage = response.usageMetadata as Record<string, number> | undefined;
    if (usage) {
      const state = this.job.state as State & { model_usage?: unknown[] };
      state.model_usage = [...(state.model_usage || []), { model: 'gemini-3.8-flash', input_tokens: usage.promptTokenCount || 0, output_tokens: usage.candidatesTokenCount || 0, thinking_tokens: usage.thoughtsTokenCount || 0, checked_at: iso() }];
    }
    const candidates = response.candidates as { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    const first = candidates?.[0];
    if (!first || first.finishReason !== 'STOP') {
      (this.job.state as State & { model_finish_reason?: string }).model_finish_reason = String(first?.finishReason || 'MISSING').slice(0,60);
      throw new Error('Gemini did not finish structured output');
    }
    const text = first.content?.parts?.map(p => p.text || '').join('');
    if (!text) throw new Error('Gemini returned no structured output');
    return record(JSON.parse(text));
  }
  async brief() {
    const s = this.job.state;
    s.evidence ||= [];
    for (const url of [this.job.agency_url, this.job.client_url]) {
      if (!s.evidence.some(source => source.url === publicUrl(url))) { s.evidence.push(await this.scrape(url)); await this.save(); }
    }
    const result = await this.model(`Build a concise research brief from these two pages and the selected service. Return exactly this typed shape: {"agency":"plain text summary","reference":"plain text summary","target":"plain text buyer profile","service":"plain text selected service","queries":["first search query","second search query"],"public_clients":["explicitly named client company"]}. The first four fields MUST be strings, never nested objects or arrays. Target must explain the reference company's business, buyer audience, size/geography only when evidenced, and the agency's relevant actual offer. Search queries must find buyer companies similar to the reference. When the reference is an agency, other agencies can be buyers; exclude agencies only when the reference is a brand or operating business buying agency services. Exclude directories. Do not narrowly require unsupported size/geography. The selected service constrains the opportunity.`, { agency_url: this.job.agency_url, client_url: this.job.client_url, selected_service: this.job.service, sources: s.evidence }, BRIEF_SCHEMA);
    try { s.brief = parseBrief(result); }
    catch (error) { s.brief_error_response = result; await this.save(); throw error; }
    s.exclusions = [this.job.agency_url, this.job.client_url];
    await this.advance('discovery');
  }
  async discovery() {
    const s = this.job.state;
    if (!s.brief) throw new Error('Missing durable brief');
    s.searches ||= [];
    for (const query of s.brief.queries.slice(s.searches.length)) { s.searches.push(await this.search(query, 8)); await this.save(); }
    const result = await this.model(`From these search results select up to 8 actual prospective buyer companies resembling the reference business. Return {candidates:[{name,website}]}. Use only company website URLs that occur in search sources, use origin URLs, exclude the submitted agency, reference company, public_clients and directories/media/marketplaces. Other agencies are valid prospects when the reference itself is an agency buying the submitted service. Favor plausible relevant buyers over famous enterprise giants. Do not invent companies or domains.`, { brief: s.brief, sources: s.searches.flat(), exclusions: s.exclusions }, DISCOVERY_SCHEMA);
    if (!Array.isArray(result.candidates)) throw new Error('Invalid discovery output');
    const seen = new Set((s.exclusions || []).map(domain));
    s.candidates = result.candidates.slice(0, 8).flatMap(value => {
      try {
        const c = record(value), website = publicUrl(str(c.website, 2000)), name = str(c.name, 160), host = domain(website);
        if (seen.has(host) || s.brief!.public_clients.some(n => n.toLowerCase() === name.toLowerCase()) || !s.searches!.flat().some(e => domain(e.url) === host)) return [];
        seen.add(host); return [{ name, website: new URL(website).origin + '/' }];
      } catch { return []; }
    });
    s.index = 0; s.companies = []; s.skipped = [];
    await this.advance(s.candidates.length ? 'research' : 'finalize');
  }
  async research() {
    const s = this.job.state, candidate = s.candidates?.[s.index || 0];
    if (!candidate || (s.companies?.length || 0) >= 5) { await this.advance('finalize'); return; }
    s.active ||= { evidence: [] };
    const a = s.active;
    try {
      if (!a.home_done) { a.evidence.push(await this.scrape(candidate.website)); a.home_done = true; await this.save(); }
      if (!a.page_results) { a.page_results = await this.search(`site:${domain(candidate.website)} ${this.job.service.slice(0, 80)} product services customers`); await this.save(); }
      if (!a.page_done) {
        const extra = a.page_results.find(e => domain(e.url) === domain(candidate.website) && new URL(e.url).pathname !== '/' && !/\.(pdf|jpg|png)$/i.test(new URL(e.url).pathname));
        if (extra) { try { a.evidence.push(await this.scrape(extra.url)); } catch (e) { if (!(e instanceof SourceUnavailable)) throw e; } }
        a.page_done = true; await this.save();
      }
      if (!a.contacts) { a.contacts = await this.search(`"${candidate.name.replace(/"/g, '')}" (founder OR CEO OR "chief executive officer") site:linkedin.com/in`); a.evidence.push(...a.contacts); await this.save(); }
      if (!a.contact_done) {
        // LinkedIn can block public scrapes; search receipts remain explicit identity sources.
        const contact = a.contacts.find(e => /(^|\.)linkedin\.com$/.test(new URL(e.url).hostname) && new URL(e.url).pathname.startsWith('/in/'));
        if (contact) { try { a.evidence.push(await this.scrape(contact.url)); } catch (e) { if (!(e instanceof SourceUnavailable)) throw e; } }
        a.contact_done = true; await this.save();
      }
      if (!a.draft) {
        a.draft = await this.model(`Evaluate this one candidate company against the brief. Distinguish COMPANY fit from CONTACT role: an agency owner is a person inside a prospective agency company. When the brief targets agency owners, an agency matching the business profile is the correct company type; do not reject a company because it is not an individual owner. Return {eligible:false,reason:"plain text rejection reason",company:null} if the specific opportunity or current relevant contact cannot be evidenced. Otherwise return {eligible:true,reason:"plain text acceptance reason",company:{name,website,fit,fit_sources:[{url,quote}],finding:{title,observation,kind:"observation",source_url,quote,agency_help},contact:{name,role,linkedin_url,source_url,quote,current_role:true,email:null,email_quote:null,email_source_url:null},message}}. Every quote must be contiguous exact source text; no ellipses. Contact quote must contain full person name, exact role and company name together, and current_role true only if that source establishes the current employer. linkedin_url must be a collected exact profile URL whose text names this same full person and company, or be explicitly linked alongside the person name on a scraped company page. This corroboration may be separate from the required current identity and role source; never guess a profile. Provide at least two distinct fit receipts supporting two separate matching details. Fit quotes and finding quote must be from actual scraped company pages. Require a specific service-relevant visible detail, not a generic suggestion any business could use. Opportunity is a proposal, not proof of a problem. No absence claims. Return candidate name exactly as supplied, unless obviously wrong then reject. Draft message <=85 words: start with one specific sourced page detail (name the actual topic, example or offer), suggest one small concrete deliverable tied to that detail and the submitted service, then ask a question about that observation or permission to share one specific idea. Do not ask for a call, chat or meeting, and do not say would you be open to exploring. No generic praise, comprehensive, valuable insights, amplify, expertise framing, or vague outcomes. The message should be unusable for an unrelated company.`, { brief: s.brief, candidate, sources: a.evidence }, DRAFT_SCHEMA);
        await this.save();
      }
      const draft = record(a.draft);
      if (draft.eligible !== true) { await this.skip(candidate, typeof draft.reason === 'string' ? draft.reason.slice(0, 250) : 'Insufficient evidence'); return; }
      let company: Company | undefined, validationError: unknown;
      const discarded: DiscardedFit[] = [];
      try { company = validateCompany(draft.company, a.evidence, [...(s.exclusions || []), ...(s.companies || []).map(c => c.website)], discarded); }
      catch (e) { validationError = e; }
      if (discarded.length) {
        s.fit_audit = [...(s.fit_audit || []).filter(entry => entry.website !== candidate.website), { website: candidate.website, discarded }];
        await this.save();
      }
      if (!company) { await this.skip(candidate, validationError instanceof Error ? validationError.message : 'Evidence gate failed'); return; }
      if (!a.reviewed) {
        const review = await this.model(`Act as a skeptical evidence auditor. Separate COMPANY fit from CONTACT role: a brief targeting agency owners means identify relevant agency companies and their owners. A company cannot itself be a person; never reject a matching agency on that basis. Check the proposed company against raw sources, reference buyer fit and the selected service. Return {approved:boolean,reason:string}. Approve ONLY if at least two distinct matching details are supported by the retained fit_sources quotes and fit is genuinely similar, every factual observation and outreach claim is supported, the opportunity is concrete and relevant to that agency service, the source quote supports the entire claim, and a currently relevant decision maker is explicitly tied to this exact company with correct LinkedIn. Reject unsupported absence, inferred ad activity, vague improve conversions suggestions, wrong employer, historical role, invented certainty, or evidence too thin. Contact search snippets are acceptable only when they unambiguously name person, current role and company; temporal ambiguity fails. The supplied quote merely matching text is insufficient if its meaning does not support the claim.`, { brief: s.brief, proposed: { ...record(draft.company), fit_sources: company.fit_sources }, sources: a.evidence }, REVIEW_SCHEMA);
        if (review.approved !== true) { await this.skip(candidate, typeof review.reason === 'string' ? review.reason.slice(0, 250) : 'Independent evidence review failed'); return; }
        a.reviewed = true; await this.save();
      }
      const email = publicPersonEmail(draft.company, company, a.evidence);
      if (email && Deno.env.get('MILLIONVERIFIER_API_KEY')) {
        try {
          await this.reserve('verification');
          const url = new URL('https://api.millionverifier.com/api/v3/');
          url.search = new URLSearchParams({ api: env('MILLIONVERIFIER_API_KEY'), email, timeout: '10' }).toString();
          const result = await this.request(url.toString(), { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' } }, 'MillionVerifier');
          if (emailIsVerified(result)) company.contact = { ...company.contact, email, email_status: 'verified', verified_at: iso() };
        } catch (e) { if (e instanceof LostLease) throw e; /* Unknown/timeout email is withheld; company research remains valid. */ }
      }
      s.companies ||= []; s.companies.push(company);
      await this.finishCandidate();
    } catch (e) {
      if (e instanceof SourceUnavailable) { await this.skip(candidate, e.message); return; }
      if (e instanceof BudgetExceeded) { s.skipped ||= []; s.skipped.push({ website: candidate.website, reason: e.message }); await this.advance('finalize'); return; }
      throw e;
    }
  }
  async skip(candidate: Candidate, reason: string) { this.job.state.skipped ||= []; this.job.state.skipped.push({ website: candidate.website, reason, ...(this.job.state.active?.draft ? { draft: this.job.state.active.draft } : {}) }); await this.finishCandidate(); }
  async finishCandidate() {
    const s = this.job.state;
    // Durable raw receipts are private state, never included in the delivered report.
    s.evidence ||= []; s.evidence.push(...(s.active?.evidence || [])); delete s.active;
    s.index = (s.index || 0) + 1;
    await this.advance(s.index >= (s.candidates?.length || 0) || (s.companies?.length || 0) >= 5 ? 'finalize' : 'research');
  }
  async finalize() {
    const companies = (this.job.state.companies || []).map(reportCompany), count = companies.length;
    const summary = count >= 3 ? `${count} companies passed the public-source fit, observation and contact checks. Observations describe the pages checked, and the suggested messages are drafts for your review.` : count ? `${count} ${count === 1 ? 'company' : 'companies'} passed the checks. This is a partial shortlist; we have only included matches supported by the research.` : 'No candidates passed all fit, observation and current-contact checks. Try a reference client with a clearer public website or a more specific service.';
    await this.advance('deliver', { report: { companies, summary }, status: this.job.review_required ? 'pending_review' : 'queued' });
  }
  async deliver() {
    if (this.job.review_required) { await this.advance('deliver', { status: 'pending_review' }); return; }
    const companies = this.job.report.companies;
    if (!Array.isArray(companies) || !this.job.report.summary) throw new Error('Report has not been persisted');
    if (this.job.email_status !== 'sent') {
      const token = await reportToken(this.job.id);
      const url = `https://resources.ivanmanfredi.com/target-companies/report.html#${token}`;
      const response = await this.request('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': `icp-shortlist/${this.job.id}` }, body: JSON.stringify({ from: env('RESEND_FROM'), to: [this.job.email], subject: companies.length ? 'Your target-company shortlist is ready' : 'Your target-company research is ready', text: `${this.job.report.summary}\n\nOpen your private report:\n${url}\n\nThis link gives access to your report. Keep it private.\n\nIvan` }) }, 'Resend');
      const id = str(response.id, 200);
      // Persist delivery before releasing the job. A retry uses the same provider idempotency key.
      await this.save({ email_status: 'sent', email_id: id }); this.job.email_status = 'sent';
    }
    await this.advance('done', { status: companies.length >= 3 ? 'complete' : companies.length ? 'partial' : 'needs_clarification', completed_at: iso(), email_status: 'sent' });
  }
  async run() {
    const phase = this.job.phase;
    if (phase === 'brief') await this.brief(); else if (phase === 'discovery') await this.discovery(); else if (phase === 'research') await this.research(); else if (phase === 'finalize') await this.finalize(); else if (phase === 'deliver') await this.deliver(); else throw new Error('Unexpected job phase');
  }
  async fail(error: unknown) {
    if (error instanceof LostLease) return;
    const failed = this.job.attempts >= 3;
    // Error descriptions are deliberately sanitized; raw upstream payloads stay out of storage/logs.
    const message = error instanceof Error && /^(Missing |Firecrawl |Gemini |Resend |Phase time|Research |Invalid |Unexpected |Public page|Missing durable|Report has)/.test(error.message) ? error.message.slice(0, 180) : 'Research step temporarily failed';
    await this.save({ status: failed ? 'failed' : 'queued', error: message, lease_id: null, lease_until: null, next_run_at: new Date(Date.now() + (failed ? 0 : 60_000)).toISOString(), ...(failed ? { completed_at: iso() } : {}) });
  }
}

export async function handler(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = request.headers.get('authorization');
  const secrets = [Deno.env.get('ICP_SHORTLIST_SECRET'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')].filter(Boolean);
  if (!secrets.some(secret => authorization === `Bearer ${secret}`)) return json({ error: 'Unauthorized' }, 401);
  let input: Record<string, unknown> = {};
  try { const raw = await request.text(); if (raw.length > 1024) return json({ error: 'Invalid request' }, 400); if (raw) input = record(JSON.parse(raw)); }
  catch { return json({ error: 'Invalid request' }, 400); }
  if (input.id !== undefined && (typeof input.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id))) return json({ error: 'Invalid id' }, 400);
  const rows = await pg('rpc/icp_shortlist_claim', { method: 'POST', body: JSON.stringify({ p_id: input.id || null }) });
  if (!Array.isArray(rows) || !rows.length) return json({ claimed: false });
  const job = rows[0] as Job, runner = new Runner(job);
  try { await runner.run(); return json({ claimed: true, id: job.id, phase: job.phase }); }
  catch (error) { await runner.fail(error); return json({ claimed: true, id: job.id, retry: job.attempts < 3 }, 200); }
}

if (import.meta.main) Deno.serve(handler);
