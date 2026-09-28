# Deployment and CI/CD

How code gets from a laptop to https://datacampaigntracker.fly.dev, and how to
work on this project from more than one machine.

---

## The mental model

There are three separate things, and confusing them causes most of the pain:

| | Where it lives | Who changes it |
|---|---|---|
| **Code** | git → GitHub → a Docker image → a Fly machine | pull requests |
| **Runtime config** | Fly secrets (`fly secrets list`) | `fly secrets set`, by hand |
| **Data** | the `tracker_data` volume at `/data` | `sync.js`, from the Google Sheet |

**Deploys replace code only.** A deploy never touches `/data`. You cannot lose
campaign data by deploying, and you cannot fix a data problem by deploying.

The source of truth for data is the **Google Sheet**, not the volume. The volume
is a cache that `sync.js` refills. This is why preview environments are cheap —
see below.

---

## The pipeline

```
 issue filed ──> @claude ──> agent branch ──> pull request
                                                   │
                                   ┌───────────────┼───────────────┐
                                   ▼               ▼               ▼
                              ci.yml         preview.yml      human review
                         build + smoke    dct-pr-N.fly.dev   clicks the preview
                                   └───────────────┼───────────────┘
                                                   ▼
                                          approve + merge to main
                                                   │
                                                   ▼
                                              deploy.yml
                                          flyctl deploy --remote-only
                                                   │
                                                   ▼
                                    datacampaigntracker.fly.dev
```

`main` is protected. You cannot push to it directly — open a PR.

### The workflows

| File | Fires on | Does |
|---|---|---|
| `ci.yml` | every PR | `npm ci`, `npm run build`, `npm run smoke` |
| `preview.yml` | PR opened/updated/closed | creates `datacampaigntracker-pr-<n>`, comments the URL, destroys it on close |
| `deploy.yml` | push to `main` | `flyctl deploy`, then health-checks the live site |
| `claude.yml` | `@claude` on an issue or PR | agent branches, edits, opens a PR |

### What the smoke test actually proves

`scripts/smoke.sh` boots the real server against an **empty** `DATA_DIR` and
probes `/`, `/api/status`, `/api/buildings`, `/api/sync-status` and
`/api/strava/status`. With no secrets set the app must still start and degrade
gracefully.

This catches *"the app imports a file that isn't in git."* That is not
hypothetical: production ran for months on a `strava.js` that existed on exactly
one laptop and in no commit.

It does **not** check that coverage math, parsing, or map rendering are correct.
There is no unit test suite yet. Until there is, the preview deployment plus a
human eye is the real quality gate — which is why nothing auto-merges.

Run it yourself before pushing:

```bash
npm run ci        # build + smoke
```

---

## Working on this from a new machine

```bash
git clone git@github.com:RockyShaikh/DataCampaignTracker.git
cd DataCampaignTracker
npm install
npm run dev       # Vite dev server
```

A fresh clone has an **empty `data/`** — campaign data is never in git. The
dashboard will load with no runs. To populate it locally, point the sync engine
at the Sheet:

```bash
SHEET_ID=<id> LOG_GID=<gid> MANIFEST_GID=<gid> npm run serve
```

Ask a maintainer for the IDs, or read them off `fly secrets list`. The Sheet must
stay shared "anyone with the link → Viewer".

---

## One-time setup

Done once per repository. If the pipeline is already running, skip this.

1. **Fly deploy token** → GitHub secret `FLY_API_TOKEN`
   ```bash
   fly tokens create deploy -a datacampaigntracker
   ```
   Scoped to deploying this one app. Paste into
   *Settings → Secrets and variables → Actions*.

2. **Claude subscription token** → GitHub secret `CLAUDE_CODE_OAUTH_TOKEN`
   ```bash
   claude setup-token
   ```
   Uses your Claude Pro/Max/Team subscription. **No Anthropic API key needed.**

3. **Sheet config** → GitHub secrets `SHEET_ID`, `LOG_GID`, `MANIFEST_GID`
   so preview apps can populate themselves. Read the current values off
   `fly secrets list` or the Sheet URL.

4. **Branch protection** on `main`
   *Settings → Branches → Add rule*:
   - Require a pull request before merging — 1 approval
   - Require status checks to pass — select **`build + smoke`**
   - Do not allow bypassing the above settings

---

## Rollback

Deploys are immutable images, so rolling back is redeploying an old one.

```bash
fly releases -a datacampaigntracker              # find the version you want
fly status -a datacampaigntracker                # shows the current image ref
fly deploy --image registry.fly.io/datacampaigntracker:deployment-<ID>
```

This version of flyctl has no `fly releases rollback` subcommand.

Back up the volume before anything risky:

```bash
fly ssh console -C "sh -c 'cd /data && tar czf /tmp/data-backup.tgz .'"
fly ssh sftp get /tmp/data-backup.tgz -a datacampaigntracker
```

---

## Moving off Fly later

The plan is to eventually run this on a lab machine. The pipeline is built so
that only **one file** has to change.

**What is already portable:** the `Dockerfile`. It is the deployable artifact and
knows nothing about Fly. Any host that runs a container runs this app.

**What is Fly-specific:** `deploy.yml`, `preview.yml`, `fly.toml`,
`fly.preview.toml`. Keep it that way — never let Fly-isms leak into `server.js`,
the `Dockerfile`, or app code. The app's only infrastructure contract is:

- `PORT` — what to listen on
- `DATA_DIR` — a writable directory that persists across restarts

**The migration, when it happens:**

1. **Runner** — register the lab machine as a GitHub *self-hosted runner*. It
   polls GitHub outbound, so no inbound firewall holes or static IP required.
   `deploy.yml` becomes `runs-on: self-hosted` with a `docker compose up -d`
   step instead of `flyctl deploy`.
2. **Data** — tar `/data` off the Fly volume (command above) and untar it into
   the new host's bind mount. Or just let `sync.js` rebuild `log.csv` and
   `manifest.csv` from the Sheet and carry over only `buildings.json`,
   `matches.json`, `paths.json`, `overrides.json`.
3. **Reachability** — a lab desktop has no public IP. Cloudflare Tunnel or
   Tailscale Funnel both expose it over HTTPS without opening a port.
4. **Secrets** — Fly secrets become an `.env` file (gitignored) or the runner's
   repository secrets.
5. **Previews** — either drop them, or run them as local containers on ports
   `8000 + PR number`, reachable over the tunnel.

Nothing in the current setup blocks any of that.
