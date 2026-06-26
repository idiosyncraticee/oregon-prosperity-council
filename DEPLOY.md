# Deploying this explorer

This repo is a standalone sibling explorer **composed into yex.ai** at:

> **https://yex.ai/gov/oregon/prosperity-council/**

## To ship an update

```bash
npm run deploy:gov
```

That's it. The script builds with `BASE_PATH=/gov/oregon/prosperity-council` (so
asset and link URLs carry the mount) and deploys `out/` to the Vercel origin
project `oregon-prosperity-council-gov`. Nothing in the yexai repo needs to
change.

## How it's served (the architecture)

```
Browser → yex.ai/gov/oregon/prosperity-council/…
        → Cloudflare Worker (yexai repo, route yex.ai/gov/*)   ← strips the mount
        → Vercel static project  oregon-prosperity-council-gov  ← this repo's BASE_PATH build
```

- There is **no Cloudflare Tunnel and no `serve.mjs`** in the live path.
  `npm run serve` / `serve.mjs` is only for local standalone preview, and
  `next dev` for development.
- The single source of truth for the route lives in the yexai repo
  (`data/atlas.ts`, `status: "vercel"`); it is already wired and does not change
  on a content update.

## One-time setup (already done)

- Vercel CLI logged in to team `chs-projects-09ef95ea` (`vercel login`).
- Origin project `oregon-prosperity-council-gov` exists with Deployment
  Protection **off** (so the Worker can fetch it).
- Worker deployed on `yex.ai/gov/*` and `origin.yex.ai` configured — see
  `yexai/infra/cloudflare/README.md`.
