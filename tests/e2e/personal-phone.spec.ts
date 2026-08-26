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

async function autosaveInput(page: Page, name: string, value: string) {
  const input = page.locator(`[name="${name}"]`);
  if ((await input.inputValue()) === value) {
    const type = await input.getAttribute("type");
    const temporary =
      name === "fromNumber"
        ? value === "+46701112234"
          ? "+46701112235"
          : "+46701112234"
        : name === "ownerPhone"
          ? value === "+46709123224"
            ? "+46709123225"
            : "+46709123224"
      : type === "time"
        ? value === "21:59"
          ? "22:01"
          : "21:59"
        : type === "number"
          ? value === "84"
            ? "85"
            : "84"
          : `${value} temp`;
    await input.fill(temporary);
    await input.blur();
    await expect(input.locator("xpath=..").getByText("Saved")).toBeVisible();
  }
  await input.fill(value);
  await input.blur();
  await expect(input.locator("xpath=..").getByText("Saved")).toBeVisible();
}

async function autosaveSelect(page: Page, name: string, value: string) {
  const select = page.locator(`select[name="${name}"]`);
  if ((await select.inputValue()) === value) {
    const alternative = await select.locator("option").evaluateAll(
      (options, selected) =>
        options.map((option) => (option as HTMLOptionElement).value).find(
          (option) => option !== selected,
        ),
      value,
    );
    if (alternative) {
      await select.selectOption(alternative);
      await expect(select.locator("xpath=..").getByText("Saved")).toBeVisible();
    }
  }
  await select.selectOption(value);
  await expect(select.locator("xpath=..").getByText("Saved")).toBeVisible();
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

  test("shares the owner contact by QR, SMS, mail, link and vCard", async ({
    page,
  }) => {
    await page.goto("/me/share");
    await expect(
      page.getByRole("heading", { name: "Dela min kontakt" }).first(),
    ).toBeVisible();
    await expect(page.getByAltText(/QR-kod för/)).toBeVisible();
    await expect(page.getByRole("link", { name: "SMS" })).toHaveAttribute(
      "href",
      /^sms:/,
    );
    await expect(page.getByRole("link", { name: "Mail" })).toHaveAttribute(
      "href",
      /^mailto:/,
    );
    await expect(
      page.getByRole("button", { name: "Kopiera länk" }),
    ).toBeVisible();
    const vcard = page.getByRole("link", { name: "Lägg till i Kontakter" });
    await expect(vcard).toHaveAttribute(
      "href",
      /^\/api\/public\/contact\/.+\/vcard$/,
    );
    await page.screenshot({
      path: `${ARTIFACTS}/share-my-contact.png`,
      fullPage: true,
      caret: "initial",
    });
  });

  test("Messages filters, unified thread, AI controls and composer work", async ({
    page,
  }) => {
    await page.goto("/people");
    await page.getByText("Johan Testsson").first().click();
    await page.getByRole("button", { name: "Message", exact: true }).click();
    await page.waitForURL(/\/messages\//);
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
    if ((await page.getByText(/AI saw this/).count()) > 0) {
      await expect(page.getByText(/AI saw this/)).toBeVisible();
    }
    if ((await page.getByText(/Incoming call ·/).count()) > 0) {
      await expect(page.getByText(/Incoming call ·/).first()).toBeVisible();
    }

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
    const conversationUrl = page.url();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.waitForURL(/\/messages$/);
    await page.goto(conversationUrl);
    await expect(
      page.getByText("This conversation is closed. Reopen it before sending a message."),
    ).toBeVisible();
    await expect(page.getByPlaceholder(/Message/)).toHaveCount(0);
    await page.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByPlaceholder(/Message/)).toBeVisible();

    await page.screenshot({
      path: `${ARTIFACTS}/apple-messages-thread.png`,
      fullPage: true,
      caret: "initial",
    });
  });

  test("broadcast compose, select many, personalize and import a number list", async ({
    page,
  }) => {
    await page.goto("/messages");
    await page.getByRole("link", { name: "Send to many" }).click();
    await expect(page.getByRole("heading", { name: "Send to many" })).toBeVisible();
    await page.locator('textarea[name="text"]').fill("Hej *namn*, lunch imorgon?");
    await page.getByRole("button", { name: /Personligt/ }).click();
    await expect(page.getByText(/uses \*namn\*/)).toBeVisible();
    await page.getByRole("button", { name: "Välj flera" }).click();
    await page.getByText("Johan Testsson").first().click();
    await page
      .locator('textarea[name="importedList"]')
      .fill("+46701112233, Anna");
    await page.getByRole("button", { name: /Save batch/ }).click();
    await page.waitForURL(/\/messages\/broadcast\//);
    await expect(page.getByRole("heading", { name: "Saved batch" })).toBeVisible();
    await expect(page.getByText("Hej *namn*, lunch imorgon?")).toBeVisible();
    await expect(page.getByText("Anna").first()).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACTS}/broadcast-batch.png`,
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
    const johanLink = page
      .getByText("Johan Testsson")
      .first()
      .locator("xpath=ancestor::a");
    const johanPath = await johanLink.getAttribute("href");
    expect(johanPath).toBeTruthy();
    await johanLink.click();

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
    await page
      .locator('select[name="preferredLanguage"]')
      .selectOption("sv");
    await page
      .locator('select[name="timezone"]')
      .selectOption("Europe/Stockholm");
    await page
      .locator('select[name="communicationStyle"]')
      .selectOption("informal, warm, short messages");
    await page.locator('select[name="emojiStyle"]').selectOption("light");
    await page.locator('select[name="nameDayMonth"]').selectOption("6");
    await page.locator('select[name="nameDayDay"]').selectOption("24");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page.locator('input[name="company"]')).toHaveValue("E2E AB");
    await expect(page.locator('input[name="jobTitle"]')).toHaveValue("Test Lead");
    await expect(page.locator('input[name="interests"]')).toHaveValue(
      "cars, travel",
    );
    await expect(
      page.locator('select[name="preferredLanguage"]'),
    ).toHaveValue("sv");
    await expect(page.locator('select[name="timezone"]')).toHaveValue(
      "Europe/Stockholm",
    );
    await expect(page.locator('select[name="nameDayMonth"]')).toHaveValue("6");
    await expect(page.locator('select[name="nameDayDay"]')).toHaveValue("24");
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
        .getByText(/screenshot\(s\) stored as provenance/)
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.screenshot({
      path: `${ARTIFACTS}/apple-contact-history.png`,
      fullPage: true,
      caret: "initial",
    });

    await page.goto("/people/new");
    await page.locator('input[name="firstName"]').fill("Duplicate Phone");
    await page.locator('input[name="phoneNumber"]').fill("+46700000001");
    await page.getByRole("button", { name: "Create contact" }).click();
    await expect(
      page.getByText("A contact with this phone number already exists."),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(johanPath!);
    await page.getByText("Advanced relationship").click();
    await expect(page.getByText("Relationship dimensions")).toBeVisible();
    await expect(page.getByText("What AI may do")).toBeVisible();
    await expect(page.getByText("Small talk")).not.toBeVisible();
    const mobileWidth = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(mobileWidth.content).toBeLessThanOrEqual(mobileWidth.viewport);
    await page.screenshot({
      path: `${ARTIFACTS}/mobile-contact-settings-after.png`,
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
    if (!(await page.getByText("No calls here").isVisible())) {
      await expect(page.getByText(/Incoming|Outgoing/).first()).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Conversation" }).first(),
      ).toBeVisible();
      const handled = page.getByRole("button", { name: "Mark handled" }).first();
      if (await handled.isVisible()) {
        await handled.click();
        await expect(handled).not.toBeVisible();
      }
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
    await page.getByRole("tab", { name: "Profile" }).click();
    await autosaveInput(page, "name", "Owner");
    await autosaveInput(page, "preferredLanguage", "sv");
    await autosaveInput(
      page,
      "dialogueOpenings",
      "Hej! Hur är läget?\nTjena!",
    );
    await autosaveInput(
      page,
      "dialogueClosings",
      "Vi hörs!\nHa det fint.",
    );
    await page.getByRole("tab", { name: "Calls" }).click();
    await autosaveSelect(page, "knownContacts", "RING_THROUGH");
    await autosaveSelect(page, "unknownCallers", "VOICEMAIL");
    await autosaveInput(page, "nightStart", "22:00");
    await autosaveInput(page, "nightEnd", "07:00");
    await autosaveInput(page, "nightPriorityThreshold", "85");
    await expect(page.locator('select[name="unknownCallers"]')).toHaveValue(
      "VOICEMAIL",
    );
    await page.getByRole("tab", { name: "Diagnostics" }).click();
    await expect(page.getByText("System health")).toBeVisible();
    await expect(page.getByText("AI models")).toBeVisible();
    await page.getByRole("tab", { name: "Integrations" }).click();
    await autosaveInput(page, "username", "u_e2e");
    await autosaveInput(page, "password", "p_e2e");
    await autosaveInput(page, "fromNumber", "+46701112233");
    await autosaveInput(page, "apiKey", "xi_e2e");
    await autosaveInput(page, "voiceId", "voice_e2e");
    await autosaveInput(page, "modelId", "eleven_multilingual_v2");
    await expect(
      page.getByRole("heading", { name: "Skapa “Min röst”" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Detta är min egen röst/).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Start recording" }).click();
    await page.waitForTimeout(1_500);
    await page.getByRole("button", { name: /Stop/ }).click();
    await expect(page.locator("audio").last()).toBeVisible();
    await expect(page.getByText(/Record at least 30 seconds/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Skapa Min röst" })).toBeDisabled();
    await page.screenshot({
      path: `${ARTIFACTS}/apple-settings-autosave.png`,
      fullPage: true,
      caret: "initial",
    });
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
    await page.getByRole("tab", { name: "Profile" }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACTS}/apple-settings.png`,
      fullPage: true,
      caret: "initial",
    });
  });

  test("every detail, create, edit and secondary route has a safe Back path", async ({
    page,
  }) => {
    await page.goto("/people");
    const contactHref = await page
      .getByText("Johan Testsson")
      .first()
      .locator("xpath=ancestor::a")
      .getAttribute("href");
    expect(contactHref).toBeTruthy();
    await page.goto(contactHref!);
    await page.getByRole("button", { name: "Message" }).click();
    await page.waitForURL(/\/messages\/[^/]+$/);
    const conversationPath = new URL(page.url()).pathname;

    await page.goto("/automations");
    const automationHref = await page
      .locator('a[href^="/automations/"]:not([href="/automations/new"])')
      .first()
      .getAttribute("href");
    expect(automationHref).toBeTruthy();

    const deepRoutes = [
      {
        path: "/people/new",
        label: "Back to Contacts",
        expected: "/people",
      },
      {
        path: contactHref!,
        label: "Back to Contacts",
        expected: "/people",
      },
      {
        path: `${contactHref}/edit`,
        label: "Back to Contact",
        expected: contactHref!,
      },
      {
        path: conversationPath,
        label: "Back to Messages",
        expected: "/messages",
      },
      {
        path: "/messages/broadcast",
        label: "Back to Messages",
        expected: "/messages",
      },
      {
        path: "/messages/new",
        label: "Back to Messages",
        expected: "/messages",
      },
      {
        path: "/automations/new",
        label: "Back to Automations",
        expected: "/automations",
      },
      {
        path: automationHref!,
        label: "Back to Automations",
        expected: "/automations",
      },
    ];
    for (const route of deepRoutes) {
      await page.goto("about:blank");
      await page.goto(route.path);
      await page.getByRole("button", { name: route.label }).click();
      await expect(page).toHaveURL(new RegExp(`${route.expected}$`));
    }

    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of [
      "/chat",
      "/me/share",
      "/calendar",
      "/automations",
      "/activity",
      "/settings",
    ]) {
      await page.goto("about:blank");
      await page.goto(path);
      await page.getByRole("button", { name: "Back to More" }).click();
      await expect(page).toHaveURL(/\/more$/);
    }
  });
});
