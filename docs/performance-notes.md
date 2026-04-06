# Performance Notes

These notes describe the main performance changes from Milestone 3.

## Main Changes

- Solution table lookups now use targeted `MetadataId` queries instead of full `EntityDefinitions` scans.
- Solution-scoped form, view, and cloud flow lists now load only the component ids from the solution.
- ID-based metadata fetches now use chunked requests to keep OData filters smaller on large solutions.
- `DynamicsClient` now keeps a short in-memory cache by environment and query key for repeated reads in one session.
- Expensive compare and usage tools now show warnings and use safe detail limits for large scans.

## Protected By Tests

- `src/client/__tests__/dynamics-client.test.ts` checks request cache hits and concurrent request deduplication.
- `src/tools/solutions/__tests__/solution-inventory.test.ts` checks targeted table lookup by `MetadataId`.
- `src/tools/comparison/__tests__/compare-forms.test.ts` checks compare warnings when detail fetches are truncated.
- `src/tools/usage/__tests__/usage.integration.test.ts` checks usage warnings for broad form scans.
