# Review Schema v2 Local Go / No-Go

Status: **Production database migration PASS**. Review Schema v2 migration `20260831010000` is applied; frontend deployment and the 33-row external Review import remain separately gated.

## Completed locally

- Non-destructive Review v2 migration created and applied only to Local Supabase.
- Existing legacy Review remains version 1 with its ID, relation, values, Vote counters, and timestamps preserved.
- New normal-user v2 Review create/read/Vote/delete passed.
- Imported Review uses nullable author plus controlled import metadata; existing ClassScope users are not impersonated.
- Normal authenticated users cannot create imported Reviews.
- Imported Review Vote and admin delete passed.
- Recommendation may remain null only for an imported Review and displays as an em dash rather than zero.
- Duplicate source keys are rejected/skipped idempotently.
- Cross-school Review and relationship attempts are rejected.
- SMC/OCC UI isolation passed in the exercised Local flows.
- Mapping-driven preview excludes ambiguous, not-found, invalid, PII, duplicate, and relationship-mismatch rows from candidates.

## Actual workbook result

| Workbook | Selected sheet | Raw | Valid | Matched | Ambiguous | Not found | Invalid relationship | Duplicate | Missing recommendation | Missing comment | PII excluded | Candidates |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Raku OCC 授業評価シート.xlsx | First sheet: `OCC Course Evaluations` (3 later sheets excluded) | 20 | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 16 | 0 | 4 |
| Hayato OCC Evaluation.xlsx | `Sheet1` | 10 | 10 | 3 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 3 |
| Takuto (Mechanical Engineering).xlsx | `シート1` | 30 | 29 | 26 | 0 | 3 | 0 | 0 | 30 | 0 | 0 | 26 |

The first Local import inserted 33 Reviews. Re-running the same three source workbooks inserted zero and skipped all 33 candidates. A UI admin-delete test removed one imported Review from Local, and the controlled importer restored exactly that one row.

Cross-workbook duplicate comparison found zero duplicate groups. No missing Course code or unmatched master row was inferred from course title alone, and no Professor, Course, or relationship was created.

## Fixed production batch

- Production candidates are fixed at Raku 4, Hayato 3, and Takuto 26: 33 total.
- The other 27 rows are excluded from batch v1: 16 missing required comments, 10 OCC master not found, and 1 missing required rating.
- The exclusion report retains the source workbook hash, source row number, stable row key, status, and reason without duplicating source comments or names.
- Duplicate, ambiguous, invalid relationship, PII import, secret import, and cross-school candidate counts are all zero.
- Reimporting the unified 33-row artifact into Local inserted zero and skipped all 33 rows.
- Candidate artifact SHA-256: `b60e0fcb17c9b7929d3475c9b2aa2dd37c89a8026f987c4dbfc91dbf8555e736`.

Only Raku's first sheet was read. Later sheets remained untouched and were excluded from mapping, validation, duplicate comparison, and import.

## 390 x 844 acceptance

- College Selection and SMC/OCC switching passed.
- Review Form v2 controls, imported Review display, null recommendation, Professor Stats, and navigation passed.
- Horizontal page scroll and visible text overflow are zero.
- Rating sliders have a 44 px touch target and accept input.
- Mobile header content is fully inside its 80 px container.
- Console errors, page errors, and failed network requests are zero.

## Compatibility and deployment order

- Old SMC frontend + migrated DB is safe only during the database-first window before any v2 row is inserted. The old writer explicitly supplies the complete legacy payload.
- Review v2 frontend + old DB is incompatible because it selects and writes v2 columns that do not yet exist.
- After any v2 row exists, rolling back to the old frontend is unsafe because it assumes legacy ratings are non-null.

Required order: DB migration, legacy SMC regression, Git commit/push, Vercel Review v2 deploy, SMC/OCC regression, 33 external Reviews import, final acceptance.

## Production gate

The database-first stage is complete: `20260831010000_review_schema_v2.sql` is present in Production migration history, legacy SMC data preservation passed, and the old frontend remained compatible. Frontend deployment and the fixed 33-row external Review import require their own explicit approvals; importing external Reviews remains prohibited until that final approval.
