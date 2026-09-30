# LinkedIn Network Buyer Finder

This download is the optional offline CSV workflow. The main resource starts with a LinkedIn profile URL; that lookup requires its hosted service. The offline copy can show the fictional report and process a connections export, but cannot read a real network from a URL.


Review which existing connections match the buyer criteria you supply. The local tool compares words in your CSV with editable role, business, exclusion and location phrases. Every data row keeps a decision and its supporting facts.

Start with SETUP.md. Use fictional-practice.csv to try the workflow, then compare your output with expected-decisions.md. Fill in ICP-worksheet.md before reviewing a real connections file.

The browser tool runs locally and holds uploaded records in memory. It makes no model calls, sends no messages and performs no profile scraping. Optional model review requires your own access and a separate decision to share the selected records with that service.

A fit means the supplied role and business text match your criteria. Manual review still checks whether those facts are current and relevant. This file does not establish budget, purchase intent, company size or relationship warmth.

The default phrases illustrate an agency buyer search. Replace them with your own. Missing business descriptions remain investigate; native LinkedIn exports often need this context added manually.

## Files

- SETUP.md: local browser and command-line steps.
- AGENTS.md: instructions for an assistant working with this folder.
- ICP-worksheet.md and buyer-criteria.json: criteria to edit.
- connections-template.csv: native connection headers plus optional fields.
- review-playbook.md: decision rules and duplicate handling.
- usage-and-review-guide.md: manual review, audit and export details.
- fictional-practice.csv and expected-decisions.md: a hand-checkable practice case.
- prompts/ambiguous-record-review.md: optional draft review instructions.
- run-review.cjs: an optional local Node runner.

Keep the full download folder together. The browser files and core.js live one directory above this kit folder.
