# GitHub Monitor

Local dashboard for two backlogs: PRs awaiting my review, and my PRs with
unresolved review comments — across every repo I touch.

> **Local use only.** There is no authentication on any endpoint. Do not expose
> port 8787 to the internet or an untrusted network — anyone who can reach it
> can read your PR backlog and modify snooze state.

## Requirements
- Node ≥ 20
- `gh auth login` (token auto-detected) or `GITHUB_TOKEN` in the environment

## Develop
```bash
npm install
npm run dev      # API on :8787, UI on http://localhost:5173
```

## Docker (background / always-on)
```bash
# One-time: set your token
export GITHUB_TOKEN=ghp_...          # or paste it into a .env file: GITHUB_TOKEN=ghp_...

# Start (detached)
docker compose up -d --build

# Open the dashboard
open http://localhost:8787

# Stop
docker compose down
```

Snooze state is stored in `./data/` on the host and survives container restarts.

## Run (single port)
```bash
npm run build && npm start   # http://127.0.0.1:8787
```

## Test
```bash
npm test
npm run typecheck
```
