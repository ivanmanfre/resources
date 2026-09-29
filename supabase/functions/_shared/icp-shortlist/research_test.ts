import { emailIsVerified, publicPersonEmail, validateCompany, type Evidence } from './research.ts';

function assert(ok: unknown, message = 'assertion failed'): asserts ok { if (!ok) throw new Error(message); }
function rejects(fn: () => unknown) { let threw = false; try { fn(); } catch { threw = true; } assert(threw, 'expected rejection'); }
const sources: Evidence[] = [
  { url: 'https://acme.example/product', text: 'Acme makes scheduling software for dentists. Book a 45 minute demo with our sales team. Used by independent dental practices.', kind: 'scrape', checked_at: '2026-09-30T00:00:00Z' },
  { url: 'https://www.linkedin.com/in/jane-smith', text: 'Jane Smith, Chief Executive Officer at Acme', kind: 'search', checked_at: '2026-09-30T00:00:00Z' },
];
function candidate() { return {
  name: 'Acme', website: 'https://acme.example', fit: 'Scheduling software for dentists.',
  fit_sources: [{ url: sources[0].url, quote: 'Acme makes scheduling software for dentists.' }, { url: sources[0].url, quote: 'Used by independent dental practices.' }],
  finding: { title: 'A 45 minute demo', observation: 'The product page asks visitors to book a 45 minute demo.', kind: 'observation', source_url: sources[0].url, quote: 'Book a 45 minute demo with our sales team.', agency_help: 'Build a short product walkthrough using the existing demo flow.' },
  contact: { name: 'Jane Smith', role: 'Chief Executive Officer', linkedin_url: sources[1].url, source_url: sources[1].url, quote: sources[1].text, current_role: true, email: null as string | null },
  message: 'Jane, your product page offers a 45 minute demo. We build short product walkthroughs. Would a two minute version of that flow be useful?',
}; }
Deno.test('accepts quoted observation and sourced current contact; stamps source check date', () => {
  const company = validateCompany(candidate(), sources, []);
  assert(company.finding.checked_at === sources[0].checked_at);
  assert(company.contact.email === null);
});
Deno.test('rejects invented or search-only finding evidence', () => {
  const c = candidate(); c.finding.quote = 'No product video is available.';
  rejects(() => validateCompany(c, sources, []));
  rejects(() => validateCompany(candidate(), sources.map(s => ({ ...s, kind: 'search' })), []));
});
Deno.test('rejects absence, active ad, and generic improvement claims', () => {
  for (const observation of ['The page has no explainer video.', 'Acme is running ads on Meta.', 'Improve their online presence.']) {
    const c = candidate(); c.finding.observation = observation;
    rejects(() => validateCompany(c, sources, []));
  }
});
Deno.test('rejects invented identity, stale role, guessed linkedin, and excluded company', () => {
  const identity = candidate(); identity.contact.name = 'Jim Smith'; rejects(() => validateCompany(identity, sources, []));
  const role = candidate(); role.contact.current_role = false; rejects(() => validateCompany(role, sources, []));
  const link = candidate(); link.contact.linkedin_url = 'https://linkedin.com/in/made-up'; rejects(() => validateCompany(link, sources, []));
  rejects(() => validateCompany(candidate(), sources, ['https://www.acme.example']));
});
Deno.test('rejects bad URLs and withholds unverified model email', () => {
  const bad = candidate(); bad.website = 'http://127.0.0.1'; rejects(() => validateCompany(bad, sources, []));
  const c = candidate(); c.contact.email = 'jane@acme.example';
  assert(validateCompany(c, sources, []).contact.email === null);
  assert(emailIsVerified({ quality: 'good', result: 'ok' }));
  assert(!emailIsVerified({ quality: 'risky', result: 'catch_all' }));
  assert(!emailIsVerified({ quality: 'good', result: 'unknown' }));
});
Deno.test('only considers a public named-person email from an actual company page', () => {
  const c = candidate(), company = validateCompany(c, sources, []);
  const page = { url: 'https://acme.example/team', text: 'Jane Smith: jane@acme.example', kind: 'scrape' as const, checked_at: sources[0].checked_at };
  const draft = { ...c, contact: { ...c.contact, email: 'jane@acme.example', email_source_url: page.url, email_quote: page.text } };
  assert(publicPersonEmail(draft, company, [...sources, page]) === 'jane@acme.example');
  assert(publicPersonEmail(draft, company, sources) === null);
  draft.contact.email = 'info@acme.example'; assert(publicPersonEmail(draft, company, [...sources, page]) === null);
});
Deno.test('accepts separately corroborated profile with the same named person and company', () => {
  const c = candidate(); c.contact.source_url = 'https://acme.example/team';
  const identity: Evidence = { url: c.contact.source_url, text: c.contact.quote, kind: 'scrape', checked_at: sources[0].checked_at };
  assert(validateCompany(c, [...sources, identity], []).contact.linkedin_url === sources[1].url);
  const wrongEmployer = { ...sources[1], text: 'Jane Smith, Chief Executive Officer at DifferentCo' };
  rejects(() => validateCompany(c, [sources[0], identity, wrongEmployer], []));
  const wrongPerson = { ...sources[1], text: 'Janet Jones, Chief Executive Officer at Acme' };
  rejects(() => validateCompany(c, [sources[0], identity, wrongPerson], []));
  const wrongUrl = { ...sources[1], url: 'https://www.linkedin.com/in/janet-jones' };
  rejects(() => validateCompany(c, [sources[0], identity, wrongUrl], []));
});
Deno.test('accepts an explicit named-person profile link on another company page, retains identity gate', () => {
  const c = candidate(); c.contact.source_url = 'https://acme.example/team';
  const identity: Evidence = { url: c.contact.source_url, text: c.contact.quote, kind: 'scrape', checked_at: sources[0].checked_at };
  const blog: Evidence = { url: 'https://acme.example/blog/author', text: `Written by [Jane Smith](${c.contact.linkedin_url})`, kind: 'scrape', checked_at: sources[0].checked_at };
  assert(validateCompany(c, [sources[0], identity, blog], []).contact.name === 'Jane Smith');
  rejects(() => validateCompany(c, [sources[0], identity, { ...blog, url: 'https://unrelated.example/blog' }], []));
  c.contact.current_role = false;
  rejects(() => validateCompany(c, [sources[0], identity, blog], []));
});
Deno.test('rejects generic praise and marketing filler in the outreach draft', () => {
  for (const message of ['Your comprehensive guide has valuable insights.', 'We can amplify your expertise.']) {
    const c = candidate(); c.message = message;
    rejects(() => validateCompany(c, sources, []));
  }
});
Deno.test('evidence accepts markdown-only differences and preserves all factual words and numbers', () => {
  const c = candidate();
  const formatted = { ...sources[0], text: sources[0].text + '\n\n## Our focus\nWe work exclusively with:\n\n- Product-based businesses.\n- Dental scheduling teams.\n\n**[Google Ads](https://ads.google.com):** 30-day campaigns for dental teams.' };
  c.fit_sources = [
    { url: formatted.url, quote: 'We work exclusively with: Product-based businesses. Dental scheduling teams.' },
    { url: formatted.url, quote: '[Google Ads](https://ads.google.com): 30-day campaigns for dental teams.' },
  ];
  assert(validateCompany(c, [formatted, sources[1]], []).fit_sources.length === 2);
  for (const quote of ['Google Ads: 60-day campaigns for dental teams.', 'Google Ads: 30-day profitable campaigns for dental teams.', 'We work exclusively with: Dental scheduling teams.']) {
    c.fit_sources = [{ url: formatted.url, quote }];
    rejects(() => validateCompany(c, [formatted, sources[1]], []));
  }
});
Deno.test('discards invalid supplemental fit receipts privately while requiring two valid distinct receipts', () => {
  const c = candidate(), bad = { url: sources[0].url, quote: 'Acme makes software that guarantees doubling revenue.' };
  c.fit_sources.push(bad);
  const discarded: { receipt: unknown; reason: string }[] = [];
  const company = validateCompany(c, sources, [], discarded);
  assert(company.fit_sources.length === 2 && !JSON.stringify(company).includes('doubling revenue'));
  assert(discarded.length === 1 && JSON.stringify(discarded[0].receipt) === JSON.stringify(bad));
  c.fit_sources = [bad, { ...bad, quote: 'Another entirely invented unsupported matching detail.' }];
  rejects(() => validateCompany(c, sources, []));
  c.fit_sources = [candidate().fit_sources[0], bad];
  rejects(() => validateCompany(c, sources, []));
  c.fit_sources = [candidate().fit_sources[0], candidate().fit_sources[0]];
  rejects(() => validateCompany(c, sources, []));
});
Deno.test('same-company adjacent author heading can establish the full name for a first-name bio', () => {
  const c = candidate();
  c.contact = { ...c.contact, name: 'Greg Shuey', role: 'founder and CEO', source_url: 'https://acme.example/blog', linkedin_url: 'https://www.linkedin.com/in/greg-shuey', quote: 'Greg is the founder and CEO of Acme and a seasoned digital marketer who has worked with thousands of businesses, large and small, to generate more revenue via online marketing strategy and execution.' };
  const bio: Evidence = { url: c.contact.source_url, kind: 'scrape', checked_at: sources[0].checked_at, text: `![Greg Shuey](https://secure.gravatar.com/avatar/example)\n\n[Greg Shuey](https://acme.example/author/greg/)\n\n${c.contact.quote}` };
  const profile: Evidence = { url: c.contact.linkedin_url, text: 'Greg Shuey, founder and CEO at Acme', kind: 'search', checked_at: bio.checked_at };
  assert(validateCompany(c, [sources[0], bio, profile], []).contact.name === 'Greg Shuey');
  rejects(() => validateCompany(c, [sources[0], { ...bio, text: `Greg Shuey\n${'Unrelated content. '.repeat(12)}\n${c.contact.quote}` }, profile], []));
  rejects(() => validateCompany(c, [sources[0], { ...bio, text: `Greg Smith\n${c.contact.quote}` }, profile], []));
  rejects(() => validateCompany(c, [sources[0], { ...bio, text: `Greg Shuey\nGreg Smith\n${c.contact.quote}` }, profile], []));
  rejects(() => validateCompany(c, [sources[0], { ...bio, kind: 'search' }, profile], []));
  c.contact.source_url = 'https://unrelated.example/blog';
  rejects(() => validateCompany(c, [sources[0], { ...bio, url: c.contact.source_url }, profile], []));
});
