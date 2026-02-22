#!/usr/bin/env node

const input = process.argv[2] ?? process.env.APP_URL ?? "https://gemindex.onrender.com";
const baseUrl = input.replace(/\/+$/, "");

function pass(message) {
  process.stdout.write(`PASS: ${message}\n`);
}

function fail(message) {
  process.stderr.write(`FAIL: ${message}\n`);
}

async function run() {
  let failed = false;

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!healthRes.ok) {
      failed = true;
      fail(`/api/health returned ${healthRes.status}`);
    } else {
      const health = await healthRes.json();
      if (health?.status !== "ok") {
        failed = true;
        fail(`/api/health status is not ok: ${JSON.stringify(health)}`);
      } else {
        pass(`/api/health is ok (sets=${health?.totals?.sets ?? "?"}, cards=${health?.totals?.cards ?? "?"})`);
      }
    }
  } catch (error) {
    failed = true;
    fail(`/api/health request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const homeRes = await fetch(baseUrl, {
      method: "GET",
      headers: { Accept: "text/html" },
    });
    const html = await homeRes.text();
    if (!homeRes.ok) {
      failed = true;
      fail(`/ returned ${homeRes.status}`);
    } else if (html.includes("Create Next App") || html.includes("To get started, edit the page.tsx file")) {
      failed = true;
      fail("Homepage appears to be Next.js starter template, not Gem Index");
    } else if (html.includes("Gem Index")) {
      pass("Homepage contains Gem Index UI markers");
    } else {
      failed = true;
      fail("Homepage loaded but Gem Index markers were not detected");
    }
  } catch (error) {
    failed = true;
    fail(`/ request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (failed) {
    process.exit(1);
  }
  pass(`Deployment verified for ${baseUrl}`);
}

run();
