# ChatGPT (Business / Team / Enterprise / Edu / Pro)

> **Status:** 🚧 **In Progress** — walkthrough ready, but this path inherently requires a **publicly reachable HTTPS URL** (ChatGPT's backend runs in OpenAI's cloud and cannot reach `127.0.0.1`). No validation run has been completed via a real tunnel yet.
> Help validate this stack: see [`docs/STATUS.md`](../STATUS.md) for acceptance criteria and the tracking issue. <!-- ISSUE:chatgpt -->

ChatGPT supports custom MCP servers **only on paid workspace tiers** (Business, Team, Enterprise, Edu, Pro). There is **no MCP support on ChatGPT Free or Plus**.

> ⚠ This path requires a **publicly reachable HTTPS URL**. ChatGPT's backend runs in OpenAI's cloud and cannot reach `127.0.0.1`. You'll need a tunnel or public deployment.

## Prerequisites

- ChatGPT workspace on Business, Team, Enterprise, Edu, or Pro
- `./scripts/install-mcp.sh` → local server on `http://127.0.0.1:8080/mcp`
- A tunnel to expose it publicly, e.g.:
  - [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/): `cloudflared tunnel --url http://127.0.0.1:8080`
  - [Tailscale Funnel](https://tailscale.com/kb/1223/funnel): `tailscale funnel 8080`
  - [ngrok](https://ngrok.com/): `ngrok http 8080`

Use the tunnel URL as your "public MCP URL" — e.g. `https://quillmark.your-tunnel.trycloudflare.com/mcp`.

## Install

### Step 1 — workspace admin enables Developer Mode

Workspace Settings → Permissions & Roles → enable **Developer Mode / Connected Data**. Only owners/admins can do this.

### Step 2 — user enables Developer Mode on their account

Settings → Apps & Connectors → Advanced settings → **Developer Mode** → ON.

### Step 3 — create the connector

Settings → Connectors → **Create**:

- **Name:** quillmark
- **URL:** `https://<your-public-tunnel>/mcp`
- **Auth:** None (add a bearer token once you've wired one up — see note below)

Save. The connector is now available to users in the workspace.

## Verify

In any ChatGPT conversation, enable the Quillmark connector (pill/toggle in the compose box) and ask:

> List available quills, then render the usaf_memo example.

ChatGPT will prompt for confirmation before calling write-like tools (`create_document`). Approve to render.

## Security notes

- **Custom connectors are not vetted by OpenAI** — they're third-party. OpenAI surfaces a confirmation modal before every write-like tool call.
- **No auth today.** The snippet above uses an unauthenticated public tunnel. For real use, put a reverse proxy (Caddy, Cloudflare Access, Tailscale ACLs) in front of the tunnel, or wait for the upcoming auth-token path in `src/cli/config.js` (the plumbing is there, the server side isn't wired yet).
- **Deep Research mode** requires the server to implement `search` and `fetch` tools on the MCP side. quillmark-mcp doesn't, so Deep Research won't be able to use it — regular chat and Agent mode will.

## Gotchas

- **Business plan cannot update published apps.** You delete and re-publish.
- **Enterprise/Edu RBAC.** Only the admin who created the connector can edit it; users can only toggle it on/off.
- **Free and Plus users** will never see a "Create connector" button. They're on the curated Apps catalog only.
