# OCC processed schedule data

These files were derived on 2026-08-30 from the official Coast Community College District public class schedule for Orange Coast College:

`https://ssb-prod.ec.cccd.edu/PROD/pw_pub_sched.p_search`

Covered official terms: Spring/Intersession 2023 through Fall 2026 (12 published term identifiers). The extraction used the public OCC selector and the official all-subject option. It did not require login, cookies, API credentials, or Supabase access.

## Included data

- `processed/occ_courses.csv`: subject, course number/title, first/last observed term
- `processed/occ_professors.csv`: published instructor name, first/last observed term
- `processed/occ_course_professors.csv`: published Course/Professor association, first/last observed term

The repository copy intentionally excludes meeting times, locations, enrollment status, student records, contact details, raw HTML, session data, and source-site assets. It contains factual catalog/schedule fields needed for the ClassScope master-data import.

## Operational notes

- Total repository size is approximately 390 KB.
- The three files contain no detected email addresses, tokens, passwords, keys, or placeholders.
- Import is disabled for Production unless separately approved; `scripts/import_occ_local.sh` is local-only.
- Checksums and validated row counts are recorded in `docs/occ-import-runbook.md`.

The repository has no global software/data license at the time of this snapshot. Including these factual extracts does not claim ownership of OCC/CCCD names or relicense source-site content. Re-extraction or broader redistribution should be reviewed against the source site's then-current terms.
