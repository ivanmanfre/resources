# Use the results and preserve the review

Start with investigate rows when the missing fact is easy to verify. Then check fits against your offer and current sources. Filter decisions to organize the review; the decisions download retains every row.

For a manual decision change, write the observation that changed your assessment and where you found it. A useful note identifies the current role or business, a source and a date. The browser keeps the original decision and reason beside the new decision. Locked duplicates and opt-outs stay locked.

The export includes identity, decision, reason, evidence, unknowns, engagement, priority, source_row, identity_key, locked, original_status, original_reason, review_note and source_json. Formula-like strings are prefixed with an apostrophe for spreadsheet safety. Keep this prefix when opening the CSV. Preserve a copy of the original source file so review edits remain traceable.

Changing buyer criteria invalidates the previous first pass. Rerun with the revised phrases and review the result. Manual changes made for one rule set may need fresh review under another.

## Limits to account for

- LinkedIn exports commonly provide a company name and job title without a business description. Add verified context or keep these records in investigate.
- Phrase matching can miss synonyms and can match ambiguous wording. Evidence shows the exact supplied text so you can inspect it.
- A native export can be stale. A title match supplies no proof the person still holds that role.
- Name and company matching can merge different people. Inspect duplicate groups before relying on a representative.
- DNC matching depends on the identities and flags you supply. Apply your existing suppression records before reviewing contacts.
- Browser records stay in memory and are cleared by refreshing or closing the page. Download your reviewed audit before you leave.
- The browser does not save records to a server. Files you download contain the supplied personal information and should be stored appropriately.

## Optional prompt workflow

Select only the records that need review. Generate the prompt, remove unnecessary fields, and decide whether you want to share those facts with a model service you use. The generated prompt excludes locked opt-outs, duplicates and invalid rows. Source content is serialized as untrusted JSON and cannot legitimately authorize actions.

Ask for evidence, unknowns and one manual research action. Verify each suggestion before changing a record. Keep a note of the fact behind the final choice. A model may help you inspect ambiguity; a missing fact stays unknown until a reliable source supplies it.
