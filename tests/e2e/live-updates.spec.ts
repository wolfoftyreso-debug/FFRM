import { expect, test, type Page } from "@playwright/test";

const JOHAN = "+46700000001";
const NUMBER = "+46766861234";

async function login(page: Page) {
  await page.goto("/login");
  if (page.url().includes("/login")) {
    await page.getByLabel("Password").fill("local-test-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/messages/);
  }
}

async function inboundSms(
  request: { post: (url: string, options: { form: Record<string, string> }) => Promise<{ ok(): boolean }> },
  message: string,
) {
  const response = await request.post("/api/webhooks/46elks/sms", {
    form: {
      id: `sLIVE${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
      from: JOHAN,
      to: NUMBER,
      message,
    },
  });
  expect(response.ok()).toBe(true);
}

test.describe("live updates", () => {
  test("an open thread shows an SMS that arrives while it is open", async ({
    page,
    request,
  }) => {
    await login(page);
    const opening = `Öppning ${Date.now()}`;
    await inboundSms(request, opening);

    await page.goto("/messages");
    await page.getByText("Johan", { exact: false }).first().click();
    await page.waitForURL(/\/messages\/[^/]+$/);
    await expect(page.getByText(opening)).toBeVisible();

    // A half-written reply must survive whatever arrives while it is typed.
    const composer = page.getByPlaceholder(/^Message…/);
    await composer.fill("Halvskrivet svar");

    const live = `Live ${Date.now()}`;
    await inboundSms(request, live);

    // No reload, no interaction: the thread refreshes itself.
    await expect(page.getByText(live)).toBeVisible({ timeout: 30_000 });
    await expect(composer).toHaveValue("Halvskrivet svar");
  });

  test("the inbox picks up a new conversation without a reload", async ({
    page,
    request,
  }) => {
    await login(page);
    await page.goto("/messages");
    const unknown = `+4670000${Math.floor(1000 + Math.random() * 8999)}`;

    const response = await request.post("/api/webhooks/46elks/sms", {
      form: {
        id: `sLIVE${Date.now()}`,
        from: unknown,
        to: NUMBER,
        message: "Hej, är detta rätt nummer?",
      },
    });
    expect(response.ok()).toBe(true);

    await expect(page.getByText(unknown).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
