# Target-company shortlist

Public page: https://resources.ivanmanfredi.com/target-companies/

React source is in `react-src/`. Run `npm ci` then `npm run build` there to regenerate the page, report and bundled assets. The build also updates this directory's `index.html`. Keep the two WebP illustrations and Inter font/license in `assets/`.

The sample company and contact are fictional and labeled accordingly. Submitted briefs use the `icp-shortlist` Edge Function. Private report tokens stay in the URL fragment; the report sends them only to that function, and the server returns no requester email or raw research state.

The backend and its migrations are in `supabase/`. See `docs/icp-shortlist/implementation.md` for queue, evidence and delivery details. No keys belong in this page or its build.
