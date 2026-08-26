import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const ARTIFACTS = "/opt/cursor/artifacts/screenshots";

async function login(page: Page) {
  await page.goto("/login");
  if (page.url().includes("/login")) {
    await page.getByLabel("Password").fill("local-test-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/messages/);
  }
}

test.describe.serial("Personal Phone complete UI", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) =>
      console.error(`[browser pageerror] ${error.message}`),
    );
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.error(`[browser console] ${message.text()}`);
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        console.error(
          `[browser response] ${response.status()} ${response.url()}`,
        );
      }
    });
    await login(page);
  });

  test("Apple-native shell works on desktop and mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/messages/);
    for (const label of [
      "Phone",
      "Messages",
      "Contacts",
      "Assistant",
      "Calendar",
      "Automations",
      "Activity",
      "Settings",
    ]) {
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }).getByText(label),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("link", { name: "Messages" }).first(),
    ).toHaveAttribute("aria-current", "page");

    await page.setViewportSize({ width: 390, height: 844 });
    const tabBar = page.getByRole("navigation", { name: "Tab bar" });
    for (const label of ["Phone", "Messages", "Contacts", "More"]) {
      await expect(tabBar.getByText(label, { exact: true })).toBeVisible();
    }
    await tabBar.getByText("More", { exact: true }).click();
    await expect(page).toHaveURL(/\/more/);
    await expect(page.getByRole("link", { name: /Settings/ })).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACTS}/apple-mobile-shell.png`,
      fullPage: true,
      caret: "initial",
    });
  });

  test("Messages filters, unified thread, AI controls and composer work", async ({
    page,
  }) => {
    await page.goto("/messages");
    await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
    await page.getByRole("tab", { name: "Needs You", exact: true }).click();
    await expect(page).toHaveURL(/view=needs-you/);
    await page.getByRole("tab", { name: "Unread", exact: true }).click();
    await expect(page).toHaveURL(/view=unread/);
    await page.getByRole("tab", { name: "AI", exact: true }).click();
    await expect(page).toHaveURL(/view=ai/);
    await page.getByRole("tab", { name: "Closed", exact: true }).click();
    await expect(page).toHaveURL(/view=closed/);
    await page.getByRole("tab", { name: "All", exact: true }).click();
    await expect(page).toHaveURL(/view=all/);
    await page.getByLabel("Search conversations").fill("Johan");
    await page.getByLabel("Search conversations").press("Enter");
    await expect(page.getByText("Johan Testsson").first()).toBeVisible();
    await page.getByText("Johan Testsson").first().click();

    await expect(page.getByRole("heading", { name: "Johan Testsson" })).toBeVisible();
    await expect(page.getByText(/AI saw this/)).toBeVisible();
    await expect(page.getByText(/Incoming call ·/).first()).toBeVisible();

    const takeOver = page.getByRole("button", { name: "Take over" });
    if (await takeOver.isVisible()) {
      await takeOver.click();
      await expect(page.getByText("YOU HANDLING", { exact: true })).toBeVisible();
    }
    const pause = page.getByRole("button", { name: "Pause AI" });
    if (await pause.isVisible()) {
      await pause.click();
      await expect(page.getByText("PAUSED", { exact: true })).toBeVisible();
    }
    const returnAi = page.getByRole("button", { name: "Return to AI" });
    if (await returnAi.isVisible()) {
      await returnAi.click();
      await expect(page.getByText("AI HANDLING", { exact: true })).toBeVisible();
    }

    const imageInput = page.locator('input[type="file"][name="image"]');
    await imageInput.setInputFiles({
      name: "e2e.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS4AAAAASUVORK5CYII=",
        "base64",
      ),
    });
    expect(
      await imageInput.evaluate(
        (element) => (element as HTMLInputElement).files?.length,
      ),
    ).toBe(1);
    await expect(page.getByRole("button", { name: /Send MMS/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "AI write text" })).toBeVisible();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("button", { name: /Send SMS/ })).toBeVisible();

    await page.screenshot({
      path: `${ARTIFACTS}/apple-messages-thread.png`,
      fullPage: true,
      caret: "initial",
    });
  });

  test("professional contact card, typed history and all save forms persist", async ({
    page,
  }) => {
    await page.goto("/people");
    await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
    for (const tab of ["Name", "Recent", "Priority"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
    await page.getByLabel("Search contacts").fill("Johan");
    await page.getByLabel("Search contacts").press("Enter");
    await page.getByText("Johan Testsson").first().click();

    await expect(page.getByRole("heading", { name: "Johan Testsson" })).toBeVisible();
    for (const action of ["Call", "Message", "Remind"]) {
      await expect(page.getByText(action, { exact: true }).first()).toBeVisible();
    }
    for (const filter of [
      "All",
      "Messages",
      "Photos",
      "Calls",
      "Voicemail",
      "Automation",
      "Facts",
      "Reminders",
      "System",
    ]) {
      await page.getByRole("tab", { name: filter, exact: true }).click();
      await expect(page.getByRole("tab", { name: filter, exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
    await page.getByRole("tab", { name: "All", exact: true }).click();

    const fact = `E2E fact ${Date.now()}`;
    await page.getByPlaceholder("Add a fact…").fill(fact);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(fact, { exact: true })).toBeVisible();

    const reminder = `E2E contact reminder ${Date.now()}`;
    await page.getByPlaceholder("Remind me to…").fill(reminder);
    await page
      .locator('form#reminder input[name="dueAt"]')
      .fill("2026-08-26T12:00");
    await page.getByRole("button", { name: "Create reminder" }).click();

    await page.getByRole("link", { name: "Edit" }).click();
    await page.locator('input[name="displayName"]').fill("Johan Testsson");
    await page.locator('input[name="company"]').fill("E2E AB");
    await page.locator('input[name="jobTitle"]').fill("Test Lead");
    await page.locator('input[name="interests"]').fill("cars, travel");
    await page.locator('input[name="nameDay"]').fill("2000-06-24");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page.locator('input[name="company"]')).toHaveValue("E2E AB");
    await expect(page.locator('input[name="jobTitle"]')).toHaveValue("Test Lead");
    await expect(page.locator('input[name="interests"]')).toHaveValue(
      "cars, travel",
    );
    await expect(page.locator('input[name="nameDay"]')).toHaveValue(
      "2000-06-24",
    );
    await page.goBack();
    await expect(
      page.getByRole("link", { name: /Name-day automation/ }),
    ).toBeVisible();

    await expect(page.getByText("Teach AI how we talk")).toBeVisible();
    const conversationScreenshot = await sharp({
      create: {
        width: 320,
        height: 640,
        channels: 3,
        background: { r: 245, g: 245, b: 247 },
      },
    })
      .png()
      .toBuffer();
    await page.locator('input[name="screenshots"]').setInputFiles({
      name: "conversation.png",
      mimeType: "image/png",
      buffer: conversationScreenshot,
    });
    await page.getByRole("button", { name: "Analyze style" }).click();
    await page.reload();
    await expect(
      page
        .getByText(
          /Learning from|Style learning needs attention|Learned communication profile/,
        )
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: `${ARTIFACTS}/apple-contact-history.png`,
      fullPage: true,
      caret: "initial",
    });
  });

  test("Phone, Calendar, Automations, Activity and Settings are operational", async ({
    page,
  }) => {
    await page.goto("/phone");
    for (const tab of ["Recents", "Missed", "Voicemail"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
    await page.getByRole("tab", { name: "Recents", exact: true }).click();
    await expect(page.getByText(/Incoming|Outgoing/).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Conversation" }).first()).toBeVisible();
    const handled = page.getByRole("button", { name: "Mark handled" }).first();
    if (await handled.isVisible()) {
      await handled.click();
      await expect(handled).not.toBeVisible();
    }
    await page.screenshot({
      path: `${ARTIFACTS}/apple-phone.png`,
      fullPage: true,
      caret: "initial",
    });

    await page.goto("/calendar");
    const reminder = `E2E global reminder ${Date.now()}`;
    await page.getByText("Add reminder").click();
    await page.getByPlaceholder("What should I remember?").fill(reminder);
    await page
      .locator('details input[name="dueAt"]')
      .fill("2026-08-26T13:00");
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto("/automations/new");
    const trigger = page.locator('select[name="triggerType"]');
    await expect(trigger.locator('option[value="INCOMING_SMS"]')).toHaveText(
      "When an SMS arrives",
    );
    await trigger.selectOption("INCOMING_SMS");
    await expect(page.locator('input[name="triggerDate"]')).toHaveCount(0);
    const action = page.locator('select[name="actionType"]');
    await expect(action.locator('option[value="UPDATE_CONTACT"]')).toHaveText(
      "Update a contact field",
    );
    await action.selectOption("LOG_EVENT");
    const name = `E2E incoming logger ${Date.now()}`;
    await page.locator('input[name="name"]').fill(name);
    const contactSelect = page.locator('select[name="contactId"]');
    const johanValue = await contactSelect
      .locator("option")
      .filter({ hasText: "Johan" })
      .first()
      .getAttribute("value");
    await contactSelect.selectOption(johanValue!);
    await page.locator('input[name="actionTitle"]').fill("Inbound observed");
    await page.getByRole("button", { name: "Create automation" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    const toggle = page.getByRole("button", { name: "Disable" });
    await toggle.click();
    await expect(page.getByText("DISABLED")).toBeVisible();
    await page.getByRole("button", { name: "Enable" }).click();
    await expect(page.getByText("ENABLED")).toBeVisible();
    await page.getByRole("button", { name: "Run now" }).click();
    await expect(page.getByText("COMPLETED").first()).toBeVisible();

    await page.goto("/messages?view=unread");
    await expect(page.getByText("AUTOMATIC").first()).toBeVisible();
    await expect(page.getByLabel("Unread").first()).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACTS}/apple-automatic-unread-inbox.png`,
      fullPage: true,
      caret: "initial",
    });

    await page.goto("/activity");
    await expect(page.getByText(name).or(page.getByText(/Automation/)).first()).toBeVisible();

    await page.goto("/settings");
    await page.locator('input[name="name"]').fill("Owner");
    await page.locator('input[name="preferredLanguage"]').fill("sv");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.locator('select[name="knownContacts"]').selectOption("RING_THROUGH");
    await page.locator('select[name="unknownCallers"]').selectOption("VOICEMAIL");
    await page.locator('input[name="nightStart"]').fill("22:00");
    await page.locator('input[name="nightEnd"]').fill("07:00");
    await page.locator('input[name="nightPriorityThreshold"]').fill("85");
    await page.getByRole("button", { name: "Save call policy" }).click();
    await expect(page.locator('select[name="unknownCallers"]')).toHaveValue(
      "VOICEMAIL",
    );
    await expect(page.getByText("System health")).toBeVisible();
    await expect(page.getByText("AI models")).toBeVisible();
    await page.locator('input[name="username"]').fill("u_e2e");
    await page.locator('input[name="password"]').fill("p_e2e");
    await page.locator('input[name="fromNumber"]').fill("+46701112233");
    await page.getByRole("button", { name: "Save 46elks" }).click();
    await page.locator('input[name="apiKey"]').fill("xi_e2e");
    await page.locator('input[name="voiceId"]').fill("voice_e2e");
    await page.locator('input[name="modelId"]').fill("eleven_multilingual_v2");
    await page.getByRole("button", { name: "Save ElevenLabs" }).click();
    await page.reload();
    await expect(page.locator('input[name="fromNumber"]')).toHaveValue(
      "+46701112233",
    );
    await expect(page.locator('input[name="voiceId"]')).toHaveValue("voice_e2e");
    await expect(page.locator('input[name="password"]')).toHaveValue("");
    await expect(page.locator('input[name="apiKey"]')).toHaveValue("");
    await page
      .getByRole("heading", { name: "46elks" })
      .locator("xpath=../../..")
      .screenshot({
        path: `${ARTIFACTS}/apple-provider-settings.png`,
        caret: "initial",
      });
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACTS}/apple-settings.png`,
      fullPage: true,
      caret: "initial",
    });
  });
});
