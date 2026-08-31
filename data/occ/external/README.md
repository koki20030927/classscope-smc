# OCC External Review Workspace

Raw student evaluation workbooks are not committed. Place received files under `raw/`, keep them unchanged, and create one reviewed mapping JSON per workbook from `mapping-template.json`.

For Raku, use `raku-mapping-template.json`. Its `first_sheet` policy is mandatory: only the workbook's first sheet is read, mapped, validated, deduplicated, and considered for import. Later sheets are excluded without reading their cell contents; only the workbook sheet count is used to report how many were excluded. Keep the complete original workbook unchanged.

For Hayato and Takuto, inspect the real workbook first, choose the relevant sheet, and record it with `sheet_selection: named_sheet`. Do not infer a target sheet from its position or name.

The preparation script reads only explicitly mapped academic evaluation columns. It rejects rows with suspected personal data, invalid ratings, unresolved or ambiguous master-data matches, duplicate source keys, or a missing OCC Professor-Course relationship. It never creates Professors, Courses, or relationships.

Generated preview, candidate, and report files belong under the ignored `normalized/` and `reports/` directories. They must be inspected before any Local import. Production import requires a separate explicit approval.

Example:

```sh
python3 scripts/prepare_occ_external_reviews.py \
  --input data/occ/external/raw/source.xlsx \
  --mapping data/occ/external/source-mapping.json \
  --output-dir data/occ/external/normalized/source
```

Required output gates:

- Every imported candidate is `matched`.
- Ambiguous, not-found, invalid, PII, duplicate, and relationship-mismatch rows remain excluded.
- `report.json` totals reconcile with `preview.csv` and `import_candidates.csv`.
