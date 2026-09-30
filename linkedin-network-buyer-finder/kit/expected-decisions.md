# Fictional practice: expected first pass

All names, profiles and companies in fictional-practice.csv are invented. Do not contact or research these profile URLs. Use the unchanged buyer-criteria.json and leave locations empty.

| Data row | Name | Expected decision | Why |
| --- | --- | --- | --- |
| 1 | Avery Lane | fit | Founder and marketing agency appear in supplied fields. Engagement raises priority to 3. |
| 2 | Jordan Park | fit | CEO and creative agency appear in supplied fields. Explicit no engagement leaves priority at 2. |
| 3 | Casey Reed | investigate | Company description is empty. Priority is 1. |
| 4 | Morgan Vale | pass | Recruiter matches an explicit exclusion. |
| 5 | Taylor Quinn | pass, locked | Row 6 supplies an opt-out for the same identity. |
| 6 | Taylor Quinn | duplicate, locked | Normalized profile URL and account ID link to row 5. The opt-out applies to both. |
| 7 | Riley West | investigate | Assistant to the CEO describes a support role. Confirm the current role before deciding. |
| 8 | Empty source record | invalid | There is no name, usable profile URL or account ID. |

Expected counts: 2 fit + 2 investigate + 2 pass + 1 invalid + 1 duplicate = 8 data records.

Try a required location of Poland. Avery stays fit. Jordan passes because the supplied location does not match. Casey remains investigate because location and company description are missing. Taylor remains suppressed. Riley remains investigate. Count all eight rows again.
