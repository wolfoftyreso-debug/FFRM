import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const MAX_PAGES = 80;
const SEEDS = [
  "/",
  "/messages",
  "/messages/new",
  "/messages/broadcast",
  "/messages?view=needs-you",
  "/messages?view=unread",
  "/phone",
  "/phone?view=missed",
  "/phone?view=voicemail",
  "/phone?view=callback",
  "/people",
  "/people/new",
  "/me/share",
  "/apollo",
  "/calendar",
  "/calendar/new",
  "/tasks",
  "/automations",
  "/automations/new",
  "/review",
  "/notifications",
  "/chat",
  "/activity",
  "/settings",
  "/settings?section=profile",
  "/settings?section=integrations",
  "/settings?section=calls",
  "/settings?section=diagnostics",
  "/more",
];

function normalize(href) {
  try {
    const url = new URL(href, BASE);
    if (url.origin !== new URL(BASE).origin) return null;
    if (url.pathname.startsWith("/api/")) return null;
    if (url.pathname.startsWith("/_next")) return null;
    if (url.pathname === "/login") return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

const results = [];
const visited = new Set();
const queue = [...SEEDS];
const pageErrors = [];
const consoleErrors = [];
const badResponses = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);

page.on("pageerror", (error) => {
  pageErrors.push({ url: page.url(), message: error.message });
});
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push({ url: page.url(), text: message.text() });
  }
});
page.on("response", (response) => {
  if (response.status() >= 400 && !response.url().includes("/_next/")) {
    badResponses.push({
      page: page.url(),
      url: response.url(),
      status: response.status(),
    });
  }
});

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
if (page.url().includes("/login")) {
  await page.getByLabel("Password").fill("local-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

while (queue.length && visited.size < MAX_PAGES) {
  const path = queue.shift();
  if (!path || visited.has(path)) continue;
  visited.add(path);
  const entry = {
    path,
    status: null,
    heading: null,
    errorText: null,
    emptyMain: false,
    links: 0,
  };
  try {
    const response = await page.goto(`${BASE}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    entry.status = response?.status() ?? null;
    const h1 = page.locator("h1").first();
    entry.heading = (await h1.count())
      ? (await h1.innerText()).trim().slice(0, 80)
      : null;
    const body = await page.locator("body").innerText();
    if (/Application error|Something went wrong|This page could not be found/i.test(body)) {
      entry.errorText = body.replace(/\s+/g, " ").slice(0, 180);
    }
    const mainText = (await page.locator("main").innerText().catch(() => "")).trim();
    entry.emptyMain = mainText.length < 8;
    const hrefs = await page.$$eval("a[href]", (anchors) =>
      anchors.map((a) => a.getAttribute("href")),
    );
    entry.links = hrefs.length;
    for (const href of hrefs) {
      const next = normalize(href);
      if (
        next &&
        !visited.has(next) &&
        !queue.includes(next) &&
        visited.size + queue.length < MAX_PAGES
      ) {
        queue.push(next);
      }
    }
    console.error(`ok ${entry.status} ${path} :: ${entry.heading ?? "-"}`);
  } catch (error) {
    entry.errorText = error instanceof Error ? error.message : String(error);
    console.error(`fail ${path} :: ${entry.errorText}`);
  }
  results.push(entry);
}

await browser.close();

const report = {
  visited: results.length,
  failures: results.filter(
    (row) => (row.status && row.status >= 400) || row.errorText || row.emptyMain,
  ),
  pageErrors,
  consoleErrors: consoleErrors.slice(0, 50),
  badResponses: [...new Map(badResponses.map((row) => [row.url, row])).values()].slice(
    0,
    40,
  ),
  pages: results,
};
writeFileSync("/tmp/app-flow-audit.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  visited: report.visited,
  failures: report.failures,
  pageErrors,
  badResponses: report.badResponses,
}, null, 2));
