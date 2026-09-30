# Define your buyer criteria

Complete this before you analyze a real export. Use words you can observe in the supplied fields. A phrase match needs a manual review when the wording is vague, historical or refers to someone else.

## Offer and buyer

- What do you sell?
- Which problem does it solve?
- Who can make or influence the purchase?
- Which current role phrases identify that person? Enter these in roles.
- Which business phrases describe the companies you serve? Enter these in businesses.
- Which explicit phrases identify people or companies you exclude? Enter these in exclusions.
- Is location required? Enter locations only when it affects eligibility.

## Evidence you will supply

- Role: Position, or headline when Position is empty.
- Business: company_description, attached to a named company.
- Exclusion: Position, headline, company, company_description or location.
- Geography: location.
- Relationship observation: engaged, based on a fact you know.
- Opt-out: do_not_contact, based on your suppression records.

Business and role phrases are alternatives within each category. Both categories need a match. A configured location also needs a match. Exclusions take precedence. Empty role or business criteria leave records in investigate.

## Write your phrases

roles: [ ]
businesses: [ ]
exclusions: [ ]
locations: [ ]

Use buyer-criteria.json for the command-line runner. The browser fields accept the same categories. The example values illustrate one agency search and should be edited.

## Facts that need separate research

List any commercial requirements you cannot evaluate from your CSV, such as service budget or employee range. The tool does not quietly estimate them. Keep them as questions for manual research, with a source and date beside each answer.

Before contacting anyone, confirm that the role, company and relevant facts are current and that your suppression records have been applied.
