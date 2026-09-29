# Target-company resource launch

Goal: progressive intake at the top of the existing React page, durable sourced research, private report/email delivery, deployment and one scheduled launch post after a real pilot.

Authorization: Ivan explicitly requested deployment, selected automated delivery before launch, and chose Wednesday 7 October 2026 at 10:45 Europe/Warsaw (08:45 UTC). Preserve the existing calendar, including Friday 2 October.

## Ownership and API contract

- Frontend worker owns existing out/best-client-finder-2026-09-29/react-src and generated assets only.
- Root owns additive SQL, public intake/report endpoint, integration, deploy and scheduling.
- Research worker owns supabase/functions/icp-shortlist-worker and _shared/icp-shortlist/research.ts plus tests only.
- New resources deploy path target-companies/, existing Supabase project bjbvqvzbzczjbatgmccb. No existing workflow changes.

POST /functions/v1/icp-shortlist body {agency_url,client_url,service,email,website:'',idempotency_key,attribution} ->202 {report_url,status}. GET ?token=<64hex> returns only {status,phase,companies,summary,created_at,completed_at,email_status}; never email/IP/raw checkpoints.

Table public.icp_shortlist_requests: id UUID, token_hash TEXT, email TEXT, agency_url TEXT, client_url TEXT, service TEXT, ip_hash TEXT, idempotency_key UUID, attribution JSONB, status TEXT, phase TEXT default brief, state JSONB default {}, report JSONB default {}, counters JSONB default {}, lease_id UUID, lease_until TIMESTAMPTZ, next_run_at TIMESTAMPTZ, attempts INTEGER default0, error TEXT, review_required BOOLEAN defaulttrue, is_test BOOLEAN defaultfalse, email_status TEXT defaultpending, email_id TEXT, created_at/updated_at/completed_at TIMESTAMPTZ. Status queued/researching/pending_review/complete/partial/needs_clarification/failed. Phase brief/discovery/research/finalize/deliver/done. Each phase is durable. RLS denies anon/authenticated access.

RPCs service-role only:
- icp_shortlist_claim(p_id uuid default null) -> SETOF requests; claims earliest due queued/researching job with expired/no lease; sets lease_id random, lease_until now+4min, attempts+1, status researching. Optional id only for authenticated worker tests.
- icp_shortlist_reserve(p_id uuid,p_lease uuid,p_kind text,p_amount int default1) ->bool, atomically reserves API-call count. Caps: search18,scrape24,llm16,verification5. Caller must abort on false. Counters persist before calls.

Worker reads env SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/FIRECRAWL_API_KEY/GEMINI_API_KEY/RESEND_API_KEY/RESEND_FROM/ICP_SHORTLIST_SECRET/MILLIONVERIFIER_API_KEY (last may unavailable; unknown emails withheld). Worker bearer ICP_SHORTLIST_SECRET or SUPABASE_SERVICE_ROLE_KEY only. Report token = hex HMAC-SHA256(ICP_SHORTLIST_SECRET, request.id), stored only as SHA256 hash at intake; worker recomputes for email URL.

Report shape {companies:[{name,website,fit,fit_sources:[{url,quote}],finding:{title,observation,kind:'observation',source_url,quote,checked_at,agency_help},contact:{name,role,linkedin_url,source_url,email:null|string,email_status,verified_at},message}],summary}. Company requires two distinct supported matching details, a relevant observation with words actually in stored scraped sources, and sourced decision-maker identity/role and LinkedIn. Markdown presentation is ignored in exact-word quote checks; omitted or invented words still fail. Invalid supplemental fit receipts are excluded and logged privately; fewer than two valid receipts fails. All observations dated. Do not infer active ads or sales loss from a webpage. Exclude agency/reference/public clients; dedupe domains. Partial and empty outputs allowed. Persist evidence separately in state. Untrusted scraped content is data, never instructions.

## Execution checks

- [x] Form shows one field, validates, supports Back/Enter, retains brief and handles failed/duplicate responses.
- [x] Intake rejects malformed/private URLs, spam, oversize, excessive/double submissions; public reads require unguessable token; no table grants to anon.
- [x] Worker claims atomically, cannot be called publicly, reserves bounded calls, commits only with matching lease, retries bounded failures and persists progress.
- [x] Research tests reject invented evidence/contact, unavailable email, same-company matches and bad external URLs.
- [x] Private report handles all terminal states and CSV safely.
- [x] Live pilot manually reviewed while delivery held: two accepted matches (Adnomics and STRYDE), both with supported fit/finding/current contacts. Report email sent to Ivan and confirmed in Gmail inbox. Public intake and automatic delivery released after this check.
- [x] Build/screenshots desktop+mobile and real deployed form/private report/email verified.
- [ ] Fresh public request completes without review hold; launch draft+queue with identical copy/media confirmed for October 7.

## Model and budgets

Final model: Gemini 3.8 Flash, low thinking, structured schemas and 10,000 maximum output tokens including reasoning. Provider-reported input, output and thinking token counts are retained privately. Earlier 2.5 Flash pilot drafts failed copy and audience checks; no pilot output was emailed while held. Current model API/settings verified against [Google migration guidance](https://ai.google.dev/gemini-api/docs/latest-model). Introductory pricing and future standard rates are documented on [Google pricing](https://ai.google.dev/gemini-api/docs/pricing); actual request cost depends on the recorded usage.

Migration 003 permits a corrected brief after failed or empty research, while keeping IP/global caps and duplicate protection for requests still active or already delivered. Its transaction test confirms failed/empty retries succeed and a second queued request is blocked. The test rolls back all test rows and settings.

## Verified release evidence

- 27 local tests pass, including real-source normalization, current contact evidence, wrong-person rejection, schema contracts, two fit receipts, private audit separation, worker authentication and idempotent delivery.
- Live access checks: both tables have RLS and no anon/authenticated access; all four RPCs are service-only; unauthenticated worker is rejected. Intake rejects private URLs, invalid tokens, duplicate and concurrent submissions.
- Real deployed desktop/mobile form and private report tested; final page transfer approximately558KB. Public HTML, report HTML and current cover hashes match the release files. No P0/P1 issues in independent visual review.
- First accepted pilot is partial with two matches; no fixed match count or delivery-time promise is published. Email verification was unavailable for those contacts and their emails remain blank.
- Dedicated cron `icp-shortlist-worker` runs each minute. No n8n workflows or other cron jobs changed.
- Kill switch for new requests: set `icp_shortlist_settings.enabled=false`. `auto_delivery=false` places future submissions on review hold. Existing jobs retain their submission-time review setting.
