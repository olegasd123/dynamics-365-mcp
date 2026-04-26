- If you add a new tool:
  - Update `docs/prompt-examples.md`
  - Add it to the live tests `live-fixtures.example.json`
  - Never change `live-fixtures.json`

- Execute:
  - `npm run format`
  - `npm run lint`
  - `npm test`
  - `npm run build`
