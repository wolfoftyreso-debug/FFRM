import { expect, test, type Page } from "@playwright/test";

const ARTIFACTS = "/opt/cursor/artifacts/screenshots";

async function login(page: Page) {
  await page.goto("/login");
  if (page.url().includes("/login")) {
    await page.getByLabel("Password").fill("local-test-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/messages/);
  }
}

const DESTINATIONS: { href: string; heading: string | RegExp }[] = [
  { href: "/messages", heading: "Messages" },
  { href: "/messages/new", heading: "New message" },
  { href: "/messages/broadcast", heading: "Send to many" },
  { href: "/messages?view=needs-you", heading: "Messages" },
  { href: "/messages?view=unread", heading: "Messages" },
  { href: "/phone", heading: "Phone" },
  { href: "/phone?view=missed", heading: "Phone" },
  { href: "/phone?view=voicemail", heading: "Phone" },
  { href: "/phone?view=callback", heading: "Phone" },
  { href: "/people", heading: "Contacts" },
  { href: "/people/new", heading: "New contact" },
  { href: "/settings?section=profile", heading: "Settings" },
  { href: "/me/share", heading: /Dela min kontakt/ },
  { href: "/apollo", heading: "Apollo" },
  { href: "/calendar", heading: "Calendar" },
  { href: "/calendar/new", heading: "Ny aktivitet" },
  { href: "/tasks", heading: "Tickets" },
  { href: "/automations", heading: "Automations" },
  { href: "/automations/new", heading: "New automation" },
  { href: "/review", heading: "Quotes" },
  { href: "/notifications", heading: "Notifications" },
  { href: "/chat", heading: "Assistant" },
  { href: "/activity", heading: "Activity" },
  { href: "/settings?section=calls", heading: "Settings" },
  { href: "/settings?section=integrations", heading: "Settings" },
  { href: "/settings?section=diagnostics", heading: "Settings" },
  { href: "/settings", heading: "Settings" },
  { href: "/more", heading: "More" },
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
      { name: /Massmeddelande/, url: /\/messages\/broadcast/ },
      { name: /Olästa/, url: /view=unread/ },
      { name: /Min kontakt/, url: /section=profile/ },
      { name: /Dela min kontakt/, url: /\/me\/share/ },
      { name: "Apollo Målgrupp och geografi", url: /\/apollo$/ },
      { name: /Automations/, url: /\/automations/ },
      { name: /Quotes/, url: /\/review/ },
      { name: /Notiser/, url: /\/notifications/ },
      { name: /AI-växel/, url: /section=calls/ },
      { name: /Settings/, url: /\/settings/ },
    ];
    for (const sample of samples) {
      await page.goto("/more");
      await page.getByRole("link", { name: sample.name }).first().click();
      await expect(page).toHaveURL(sample.url);
    }
  });

  test("contact, share, public card, phone, tickets and assistant stay usable", {
    timeout: 60_000,
  }, async ({
    page,
  }) => {
    await page.goto("/people");
    if (!(await page.getByText("Johan Testsson").first().isVisible().catch(() => false))) {
      await page.goto("/people/new");
      await page.locator('input[name="firstName"]').fill("Johan");
      await page.locator('input[name="lastName"]').fill("Testsson");
      await page.locator('input[name="phoneNumber"]').fill("+46700000001");
      await page.getByRole("button", { name: "Create contact" }).click();
      await page.goto("/people");
    }
    await page.getByText("Johan Testsson").first().click();
    await expect(page.getByRole("heading", { name: /Johan/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Message" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();

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
    await expect(page.getByRole("tab", { name: "Recents" })).toBeVisible();
    await page.getByRole("tab", { name: "Missed" }).click();
    await expect(page).toHaveURL(/view=missed/);
    await page.getByRole("tab", { name: "Voicemail" }).click();
    await expect(page).toHaveURL(/view=voicemail/);
    await page.getByRole("tab", { name: "Callback" }).click();
    await expect(page).toHaveURL(/view=callback/);

    await page.goto("/tasks");
    await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();
    await page.getByRole("tab", { name: "Done" }).click();
    await expect(page).toHaveURL(/view=done/);

    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "New automation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create automation" })).toBeVisible();

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
