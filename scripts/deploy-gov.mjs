#!/usr/bin/env node
// Deploy this explorer to its place in the yex.ai Atlas: the /gov path
//     https://yex.ai/gov/oregon/prosperity-council/
//
// HOW IT'S SERVED (the "new architecture"): this repo is a standalone sibling.
// Its base-path build is hosted as its own Vercel STATIC project
// (`oregon-prosperity-council-gov`), and a Cloudflare Worker in the yexai repo
// (route yex.ai/gov/*) proxies the mount path to it, stripping the prefix. There
// is NO tunnel and NO serve.mjs in the live path — `serve.mjs` is only for local
// standalone preview.
//
// TO SHIP AN UPDATE: just run `npm run deploy:gov`. It (1) builds with
// BASE_PATH so asset/link URLs carry the mount, then (2) deploys out/ to the
// Vercel origin. The Worker and yexai/data/atlas.ts need no changes.
//
// Requires the Vercel CLI logged in to the team below (`vercel login`).

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const MOUNT = "/gov/oregon/prosperity-council";
const SCOPE = "chs-projects-09ef95ea";
// The Vercel origin project the Worker proxies to (project: oregon-prosperity-council-gov).
const ORG_ID = "team_q0KrpRbRQdxavnqAXts0txRW";
const PROJECT_ID = "prj_befnGn0Yk1iM3Wefg4Jeb6QZFlPL";

const run = (cmd, env) =>
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

console.log(`▶ building with BASE_PATH=${MOUNT}`);
run("rm -rf out && npm run build", { BASE_PATH: MOUNT });

// Link out/ to the origin project so the static deploy is non-interactive and
// always targets the right project (out/ is gitignored, so this link is local).
mkdirSync("out/.vercel", { recursive: true });
writeFileSync(
  "out/.vercel/project.json",
  JSON.stringify({ projectId: PROJECT_ID, orgId: ORG_ID })
);

console.log("▶ deploying out/ to the /gov Vercel origin");
run(`vercel deploy out --prod --yes --scope ${SCOPE}`);

console.log(`✓ live at https://yex.ai${MOUNT}/`);
