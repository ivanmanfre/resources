# Set up a local review

1. Extract the complete ZIP. Open index.html from the extracted resource folder in your browser. Keep its adjacent JavaScript, CSS and assets in place.
2. Load the fictional example. The page labels it as fictional. Inspect fit, investigate, pass, invalid and duplicate rows.
3. Replace the role, business, exclusion and location phrases with your buyer criteria. Changes require a fresh analysis.
4. Export your own connections through LinkedIn's data export controls. Use an export you are authorized to review. Copy its header into connections-template.csv or upload the native file.
5. Add verified company descriptions when you have them. Save the source and date in extra CSV columns if useful; those columns remain in the audit source. Leave unverified facts empty.
6. Upload the CSV, run the first pass and review each shortlisted record. Save a review note for every manual decision change.
7. Download the decisions CSV. Keep all rows, including opt-outs and duplicates, so the totals can be checked against the input.

Blank optional cells are unknown. An engaged cell accepts yes/no, true/false, 1/0 or y/n. Other engagement wording remains unknown. A nonempty do_not_contact value locks the identity unless it is no, n, false, 0 or none. Use yes for an opt-out.

Header aliases include First Name, Last Name, URL, Company, Position and Connected On. Optional fields are company_description, headline, location, engaged, do_not_contact and account_id. The parser accepts quoted commas and line breaks and locates a recognizable header after a LinkedIn prefatory note. Malformed quotes or column counts stop the import with a data-row number. Empty physical lines are skipped; comma-only data records remain invalid.

## Optional command-line run

Install or use an existing Node.js runtime. From the extracted resource folder:

```sh
node kit/run-review.cjs kit/fictional-practice.csv kit/buyer-criteria.json local-review
```

This reads two local files and creates decisions.csv, review-prompt.txt and summary.json inside local-review. It makes no network request. Use a fresh output folder: an existing output file is preserved and causes the runner to stop.

## Optional model review

The tool can generate a prompt for records you select. Copying real records into a model service shares them with that service. Use your own access if you choose to do this, minimize the records and remove unnecessary personal fields first. GPT-6.1 Sol access is separate from this resource. The local tool works without it. Review model suggestions manually; they remain drafts.
