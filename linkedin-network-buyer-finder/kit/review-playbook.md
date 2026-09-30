# Review playbook

The first pass checks phrase matches in supplied fields. Read the evidence beside every decision. The engine handles simple wording and leaves obvious support roles, former roles and negated business descriptions for investigation. It cannot reliably understand every sentence.

| Decision | Meaning | Review action |
| --- | --- | --- |
| fit | Supplied current-role wording and company business description match configured phrases, with any required location present. | Confirm the facts are current and relevant to your offer. |
| investigate | A required fact or criterion is missing, or wording is ambiguous. | Research one missing fact; record its source and date. |
| pass | A configured exclusion, known criterion mismatch or do-not-contact rule applies. | Retain the reason in the audit. |
| invalid | No usable name, LinkedIn profile URL or account ID identifies the row. | Repair the source record and rerun. |
| duplicate | A prior row represents the same normalized identity. | Review the representative; retain this row in the audit. |

Role phrases are checked in Position. An empty Position allows headline as a fallback. Business phrases are checked in company_description; a company name alone does not establish the business. Exclusions are checked across Position, headline, company, company_description and location. Location phrases are checked only when you configure them. Word and phrase boundaries prevent a role such as founder matching inside an unrelated word.

A supplied description that has no configured business phrase is a pass. Synonyms can create false negatives. Revise your phrases or record a manual review note when verified facts support a different decision. A missing description requires investigation.

## Identity and suppression

The engine links rows by a normalized LinkedIn URL, supplied account_id, or a name plus company. URL schemes, www prefixes, case, tracking queries and trailing slashes do not create separate identities. Linked rows form a group even when different identifiers connect them through a third row. The earliest data row represents the group.

Any do_not_contact flag suppresses the whole group. Its representative becomes a locked pass; all other rows stay locked duplicates. Matching names at the same company can belong to different people, so check collisions manually. Retain the opt-out while resolving them.

## Review priority

Fits start at priority 2; investigate records start at 1. A yes engagement observation adds 1. Pass, invalid and duplicate rows have no priority. No engagement observation leaves the base priority unchanged. These numbers help order a review and express no probability of buying.

## Reconciliation

Count every data record after the header. Header-only files contain zero records. Physical blank lines are ignored, while an empty record with commas remains invalid. A sourceRow of 3 means the third data record, even if earlier quoted fields span multiple physical lines. The five decision counts must add up to the total.
