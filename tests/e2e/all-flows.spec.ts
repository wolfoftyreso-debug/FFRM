import { expect, test, type Page } from "@playwright/test";
import { TERMS } from "@/lib/terminology";

const ARTIFACTS = "/opt/cursor/artifacts/screenshots";

async function login(page: Page) {
  await page.goto("/login");
  if (page.url().includes("/login")) {
    await page.getByLabel("Lösenord").fill("local-test-password");
    await page.getByRole("button", { name: "Logga in" }).click();
    await page.waitForURL(/\/messages/);
  }
}

// Headings come from the product's own glossary, so a renamed concept can
// never leave the test asserting a word the app no longer says.
const DESTINATIONS: { href: string; heading: string | RegExp }[] = [
  { href: "/messages", heading: TERMS.messages },
  { href: "/messages/new", heading: "Nytt meddelande" },
  { href: "/messages/broadcast", heading: TERMS.broadcast },
  { href: "/messages?view=needs-you", heading: TERMS.messages },
  { href: "/messages?view=unread", heading: TERMS.messages },
  { href: "/phone", heading: TERMS.phone },
  { href: "/phone?view=missed", heading: TERMS.phone },
  { href: "/phone?view=voicemail", heading: TERMS.phone },
  { href: "/phone?view=callback", heading: TERMS.phone },
  { href: "/people", heading: TERMS.contacts },
  { href: "/people/new", heading: "Ny kontakt" },
  { href: "/settings?section=profile", heading: TERMS.settings },
  { href: "/me/share", heading: /Dela min kontakt/ },
  { href: "/apollo", heading: "Apollo" },
  { href: "/calendar", heading: TERMS.calendar },
  { href: "/calendar/new", heading: "Ny aktivitet" },
  { href: "/tasks", heading: TERMS.tasks },
  { href: "/automations", heading: TERMS.automations },
  { href: "/automations/new", heading: "Ny automation" },
  { href: "/review", heading: TERMS.insights },
  { href: "/notifications", heading: TERMS.notifications },
  { href: "/chat", heading: TERMS.assistant },
  { href: "/activity", heading: TERMS.activity },
  { href: "/settings?section=calls", heading: TERMS.settings },
  { href: "/settings?section=integrations", heading: TERMS.settings },
  { href: "/settings?section=diagnostics", heading: TERMS.settings },
  { href: "/settings", heading: TERMS.settings },
  { href: "/more", heading: TERMS.more },
];

test.describe("every destination and primary control", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
      throw new Error(`pageerror on ${page.url()}: ${error.message}`);
    });
    await login(page);
  });

  test("every catalog destination renders its heading", async ({ page }) => {
    for (const dest of DESTINATIONS) {
      const response = await page.goto(dest.href);
      expect(response?.ok() ?? true, dest.href).toBeTruthy();
      await expect(
        page.getByRole("heading", { name: dest.heading }).first(),
      ).toBeVisible();
    }
  });

  test("More links open the same destinations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/more");
    const samples = [
      { name: new RegExp(TERMS.broadcast), url: /\/messages\/broadcast/ },
      { name: new RegExp(TERMS.unread), url: /view=unread/ },
      { name: /Min kontakt/, url: /section=profile/ },
      { name: /Dela min kontakt/, url: /\/me\/share/ },
      { name: "Apollo Målgrupp och geografi", url: /\/apollo$/ },
      { name: new RegExp(TERMS.automations), url: /\/automations/ },
      { name: new RegExp(TERMS.insights), url: /\/review/ },
      { name: new RegExp(TERMS.notifications), url: /\/notifications/ },
      { name: /AI-växel/, url: /section=calls/ },
      { name: new RegExp(TERMS.settings), url: /\/settings/ },
    ];
    for (const sample of samples) {
      await page.goto("/more");
      await page.getByRole("link", { name: sample.name }).first().click();
      await expect(page).toHaveURL(sample.url);
    }
  });

  test("contact, share, public card, phone, tickets and assistant stay usable", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/people");
    if (!(await page.getByText("Johan Testsson").first().isVisible().catch(() => false))) {
      await page.goto("/people/new");
      await page.locator('input[name="firstName"]').fill("Johan");
      await page.locator('input[name="lastName"]').fill("Testsson");
      await page.locator('input[name="phoneNumber"]').fill("+46700000001");
      await page.getByRole("button", { name: "Skapa kontakt" }).click();
      await page.goto("/people");
    }
    await page.getByText("Johan Testsson").first().click();
    await expect(page.getByRole("heading", { name: /Johan/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Meddela" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Redigera" })).toBeVisible();
    await page.getByRole("link", { name: "Redigera" }).click();
    await expect(page.getByRole("button", { name: "Spara ändringar" })).toBeVisible();

    await page.goto("/me/share");
    await expect(page.getByRole("button", { name: /Lägg till logga|Byt logga/ })).toBeVisible();
    const vcard = page.getByRole("link", { name: "Lägg till i Kontakter" });
    const vcardHref = await vcard.getAttribute("href");
    expect(vcardHref).toMatch(/\/api\/public\/contact\/.+\/vcard$/);
    const token = vcardHref!.match(/\/contact\/([^/]+)\/vcard/)?.[1];
    expect(token).toBeTruthy();
    const publicResponse = await page.goto(`/c/${token}`);
    expect(publicResponse?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "Owner" })).toBeVisible();

    await page.goto("/phone");
    await expect(page.getByRole("tab", { name: "Senaste" })).toBeVisible();
    await page.getByRole("tab", { name: "Missade" }).click();
    await expect(page).toHaveURL(/view=missed/);
    await page.getByRole("tab", { name: TERMS.voicemail }).click();
    await expect(page).toHaveURL(/view=voicemail/);
    await page.getByRole("tab", { name: TERMS.callback }).click();
    await expect(page).toHaveURL(/view=callback/);

    await page.goto("/tasks");
    await expect(page.getByRole("heading", { name: TERMS.tasks })).toBeVisible();
    await page.getByRole("tab", { name: "Klara" }).click();
    await expect(page).toHaveURL(/view=done/);

    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: TERMS.assistant })).toBeVisible();
    await expect(page.locator("textarea, input[type='text']").first()).toBeVisible();

    await page.goto("/apollo");
    await expect(page.getByRole("heading", { name: "Apollo" })).toBeVisible();
    const apolloSettings = page.getByRole("link", {
      name: "Öppna Apollo-inställningar",
    });
    if (await apolloSettings.isVisible()) {
      await apolloSettings.click();
      await expect(page).toHaveURL(/section=integrations/);
      await expect(page.getByRole("heading", { name: "Apollo" })).toBeVisible();
    }

    await page.goto("/automations/new");
    await expect(page.getByRole("heading", { name: "Ny automation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Skapa automation" })).toBeVisible();

    await page.goto("/calendar/new");
    await expect(page.getByRole("heading", { name: "Ny aktivitet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Spara aktivitet" })).toBeVisible();

    await page.screenshot({
      path: `${ARTIFACTS}/all-flows-calendar-new.png`,
      fullPage: true,
      caret: "initial",
    });
  });
});
