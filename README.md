# GitHub Monitor

Local dashboard for two backlogs: PRs awaiting my review, and my PRs with
unresolved review comments — across every repo I touch.

## Requirements
- Node ≥ 20
- `gh auth login` (token auto-detected) or `GITHUB_TOKEN` in the environment

## Develop
```bash
npm install
npm run dev      # API on :8787, UI on http://localhost:5173
```

## Run (single port)
```bash
npm run build && npm start   # http://127.0.0.1:8787
```

## Test
```bash
npm test
npm run typecheck
```
