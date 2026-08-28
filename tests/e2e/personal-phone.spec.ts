import { expect, test, type Page } from "@playwright/test";
import { TERMS, conversationState } from "@/lib/terminology";
import sharp from "sharp";

const ARTIFACTS = "/opt/cursor/artifacts/screenshots";

async function login(page: Page) {
  await page.goto("/login");
  if (page.url().includes("/login")) {
    await page.getByLabel("Lösenord").fill("local-test-password");
    await page.getByRole("button", { name: "Logga in" }).click();
    await page.waitForURL(/\/messages/);
  }
}

async function autosaveInput(page: Page, name: string, value: string) {
  const input = page.locator(`[name="${name}"]`).first();
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
    await expect(input.locator("xpath=..").getByText("Sparat")).toBeVisible();
  }
  await input.fill(value);
  await input.blur();
  await expect(input.locator("xpath=..").getByText("Sparat")).toBeVisible();
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
      await expect(select.locator("xpath=..").getByText("Sparat")).toBeVisible();
    }
  }
  await select.selectOption(value);
  await expect(select.locator("xpath=..").getByText("Sparat")).toBeVisible();
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
      TERMS.phone,
      TERMS.messages,
      TERMS.contacts,
      TERMS.assistant,
      TERMS.calendar,
      TERMS.activity,
      TERMS.settings,
    ]) {
      await expect(
        page.getByRole("navigation", { name: "Huvudnavigering" }).getByText(label),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("link", { name: TERMS.messages }).first(),
    ).toHaveAttribute("aria-current", "page");

    await page.setViewportSize({ width: 390, height: 844 });
    const tabBar = page.getByRole("navigation", { name: "Flikfält" });
    for (const label of [
      TERMS.phone,
      TERMS.messages,
      TERMS.contacts,
      TERMS.more,
    ]) {
      // Not an exact match: a tab carrying an unread badge reads "Meddelanden 3".
      await expect(
        tabBar.getByRole("link", { name: label, exact: false }),
      ).toBeVisible();
    }
    await tabBar.getByRole("link", { name: TERMS.more, exact: false }).click();
    await expect(page).toHaveURL(/\/more/);
    await expect(page.getByRole("heading", { name: "Kommunikation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Personer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Planering" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI och system" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(TERMS.broadcast) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(TERMS.unread) })).toBeVisible();
    await expect(page.getByRole("link", { name: /Min kontakt/ })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Apollo Målgrupp och geografi" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(TERMS.automations) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(TERMS.insights) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(TERMS.notifications) })).toBeVisible();
    await expect(page.getByRole("link", { name: /AI-växel/ })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(TERMS.settings) })).toBeVisible();
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
    await expect(
      page.getByRole("button", { name: /Lägg till logga|Byt logga/ }),
    ).toBeVisible();
    const companyLogo = await sharp({
      create: {
        width: 240,
        height: 80,
        channels: 3,
        background: { r: 10, g: 40, b: 120 },
      },
    })
      .png()
      .toBuffer();
    await page.locator('[data-testid="company-logo-input"]').setInputFiles({
      name: "landvex.png",
      mimeType: "image/png",
      buffer: companyLogo,
    });
    await expect(page.getByRole("button", { name: "Byt logga" })).toBeVisible();
    await expect(page.getByAltText(/Logga för|Företagslogga/)).toBeVisible();
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
    await page.getByRole("button", { name: "Meddela", exact: true }).click();
    await page.waitForURL(/\/messages\//);
    await page.goto("/messages");
    await expect(page.getByRole("heading", { name: TERMS.messages })).toBeVisible();
    await page.getByRole("tab", { name: TERMS.needsYou, exact: true }).click();
    await expect(page).toHaveURL(/view=needs-you/);
    await page.getByRole("tab", { name: TERMS.unread, exact: true }).click();
    await expect(page).toHaveURL(/view=unread/);
    await page.getByRole("tab", { name: "AI", exact: true }).click();
    await expect(page).toHaveURL(/view=ai/);
    await page.getByRole("tab", { name: "Avslutade", exact: true }).click();
    await expect(page).toHaveURL(/view=closed/);
    await page.getByRole("tab", { name: "Alla", exact: true }).click();
    await expect(page).toHaveURL(/view=all/);
    await page.getByLabel("Sök konversationer").fill("Johan");
    await page.getByLabel("Sök konversationer").press("Enter");
    await expect(page.getByText("Johan Testsson").first()).toBeVisible();
    await page.getByText("Johan Testsson").first().click();

    await expect(page.getByRole("heading", { name: "Johan Testsson" })).toBeVisible();
    if ((await page.getByText(/Så här såg AI:n bilden/).count()) > 0) {
      await expect(page.getByText(/Så här såg AI:n bilden/)).toBeVisible();
    }
    if ((await page.getByText(/Inkommande samtal ·/).count()) > 0) {
      await expect(page.getByText(/Inkommande samtal ·/).first()).toBeVisible();
    }

    const takeOver = page.getByRole("button", { name: "Ta över" });
    if (await takeOver.isVisible()) {
      await takeOver.click();
      await expect(page.getByText(conversationState("USER", "OPEN").label, { exact: true })).toBeVisible();
    }
    const pause = page.getByRole("button", { name: "Pausa AI" });
    if (await pause.isVisible()) {
      await pause.click();
      await expect(page.getByText(conversationState("PAUSED", "OPEN").label, { exact: true })).toBeVisible();
    }
    const returnAi = page.getByRole("button", { name: "Låt AI svara" });
    if (await returnAi.isVisible()) {
      await returnAi.click();
      await expect(page.getByText(conversationState("AI", "OPEN").label, { exact: true })).toBeVisible();
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
    await expect(page.getByRole("button", { name: /Skicka MMS/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Låt AI skriva texten" })).toBeVisible();
    await page.getByRole("button", { name: "Ta bort" }).click();
    await expect(page.getByRole("button", { name: /Skicka SMS/ })).toBeVisible();
    const conversationUrl = page.url();
    await page.getByRole("button", { name: "Avsluta", exact: true }).click();
    await page.waitForURL(/\/messages$/);
    await page.goto(conversationUrl);
    await expect(
      page.getByText("Konversationen är avslutad. Öppna den igen innan du skickar något."),
    ).toBeVisible();
    await expect(page.getByPlaceholder(/Skriv ett SMS/)).toHaveCount(0);
    await page.getByRole("button", { name: "Öppna igen" }).click();
    await expect(page.getByPlaceholder(/Skriv ett SMS/)).toBeVisible();

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
    await page
      .getByRole("main")
      .getByRole("link", { name: TERMS.broadcast })
      .click();
    await expect(page.getByRole("heading", { name: TERMS.broadcast })).toBeVisible();
    await page.locator('textarea[name="text"]').fill("Hej *namn*, lunch imorgon?");
    await page.getByRole("button", { name: /Personligt/ }).click();
    await expect(page.getByText(/uses \*namn\*/)).toBeVisible();
    await page.getByRole("button", { name: "Välj flera" }).click();
    await page.getByText("Johan Testsson").first().click();
    await page
      .locator('textarea[name="importedList"]')
      .fill("+46701112233, Anna");
    await page.getByRole("button", { name: /Skicka till/ }).click();
    await page.waitForURL(/\/messages\/broadcast\//);
    await expect(page.getByRole("heading", { name: "Sparat utskick" })).toBeVisible();
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
    test.setTimeout(90_000);
    await page.goto("/people");
    await expect(page.getByRole("heading", { name: TERMS.contacts })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Show contacts: Alla kontakter" }).click();
    await expect(page.getByRole("dialog", { name: "Visa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Relation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fokus" })).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACTS}/contacts-filter-menu.png`,
      fullPage: true,
      caret: "initial",
    });
    await page.getByRole("link", { name: "Familj", exact: true }).click();
    await expect(page).toHaveURL(/filter=family/);
    await expect(
      page.getByRole("button", { name: "Show contacts: Familj" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Rensa kontaktfiltret" }).click();
    await expect(page).not.toHaveURL(/filter=/);
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const tab of ["Name", "Recent", "Priority"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
    await page.getByLabel("Sök kontakter").fill("Johan");
    await page.getByLabel("Sök kontakter").press("Enter");
    const johanLink = page
      .getByText("Johan Testsson")
      .first()
      .locator("xpath=ancestor::a");
    const johanPath = await johanLink.getAttribute("href");
    expect(johanPath).toBeTruthy();
    await johanLink.click();

    await expect(page.getByRole("heading", { name: "Johan Testsson" })).toBeVisible();
    for (const action of ["Ring", "Meddela", "Påminn", "AirDrop / Dela"]) {
      await expect(page.getByText(action, { exact: true }).first()).toBeVisible();
    }
    for (const filter of [
      "Allt",
      "Meddelanden",
      "Bilder",
      "Samtal",
      "Röstbrevlåda",
      "SMS-jobb",
      "Fakta",
      "Påminnelser",
      "System",
    ]) {
      await page.getByRole("tab", { name: filter, exact: true }).click();
      await expect(page.getByRole("tab", { name: filter, exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
    await page.getByRole("tab", { name: "Allt", exact: true }).click();

    const fact = `E2E fact ${Date.now()}`;
    await page.getByPlaceholder("Lägg till ett faktum…").fill(fact);
    await page.getByRole("button", { name: "Lägg till", exact: true }).click();
    await expect(page.getByText(fact, { exact: true })).toBeVisible();

    const reminder = `E2E contact reminder ${Date.now()}`;
    await page.getByPlaceholder("Påminn mig om att…").fill(reminder);
    await page
      .locator('form#reminder input[name="dueAt"]')
      .fill("2026-08-26T12:00");
    await page.getByRole("button", { name: "Skapa påminnelse" }).click();

    await page.getByRole("link", { name: "Redigera" }).click();
    const contactPhoto = await sharp({
      create: {
        width: 180,
        height: 240,
        channels: 3,
        background: { r: 20, g: 90, b: 160 },
      },
    })
      .png()
      .toBuffer();
    await page
      .locator('input[type="file"][accept*="image/jpeg"]')
      .setInputFiles({
        name: "johan.png",
        mimeType: "image/png",
        buffer: contactPhoto,
      });
    await expect(page.getByRole("button", { name: "Byt foto" })).toBeVisible();
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
    await page.getByRole("button", { name: "Spara ändringar" }).click();
    await page.getByRole("link", { name: "Redigera" }).click();
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
    await expect(page.locator("header img")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /\+ Namnsdag/ }),
    ).toBeVisible();

    await expect(page.getByText("Lär AI:n hur ni pratar")).toBeVisible();
    await page
      .locator("details")
      .filter({ hasText: "Lär AI:n hur ni pratar" })
      .evaluate((node) => {
        (node as HTMLDetailsElement).open = true;
      });
    await expect(page.getByRole("button", { name: "Analysera stilen" })).toBeVisible();
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
    await page.getByRole("button", { name: "Analysera stilen" }).click();
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
    await page.getByRole("button", { name: "Skapa kontakt" }).click();
    await expect(
      page.getByText("Det finns redan en kontakt med det numret. Öppna den i stället för att skapa en till."),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(johanPath!);
    await page.getByText("Avancerad relation").click();
    await expect(page.getByText("Relationens dimensioner")).toBeVisible();
    await expect(page.getByText("Vad AI:n får göra")).toBeVisible();
    await expect(page.getByText("Småprat")).not.toBeVisible();
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

  test("Phone, Calendar SMS jobs, Activity and Settings are operational", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/phone");
    for (const tab of [
      "Senaste",
      "Missade",
      "Röstbrevlåda",
      "Återuppringning",
    ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
    await page.getByRole("tab", { name: "Senaste", exact: true }).click();
    await expect(page.getByText("AI-växel").first()).toBeVisible();
    if (!(await page.getByText("Inga samtal här").isVisible())) {
      await expect(page.getByText(/Inkommande|Utgående/).first()).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Konversation" }).first(),
      ).toBeVisible();
      const handled = page.getByRole("button", { name: "Markera som hanterat" }).first();
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
    await page.getByText("Lägg till vanlig påminnelse").click();
    await page.getByPlaceholder("Vad ska jag komma ihåg?").fill(reminder);
    await page
      .locator('details input[name="dueAt"]')
      .fill("2026-08-26T13:00");
    await page.getByRole("button", { name: "Spara" }).click();

    await page.getByRole("link", { name: "Skapa aktivitet" }).click();
    await expect(
      page.getByRole("heading", { name: "Ny aktivitet" }),
    ).toBeVisible();
    await page
      .locator('select[name="eventKind"]')
      .selectOption("VALENTINES_DAY");
    await page.locator('select[name="contactId"]').selectOption({ index: 1 });
    await page.locator('input[name="date"]').fill("2027-02-14");
    await page.locator('input[name="time"]').fill("09:00");
    await expect(page.locator('input[name="recurring"]')).toBeChecked();
    await expect(page.locator('input[name="randomMinute"]')).toBeChecked();
    await page
      .locator('textarea[name="instruction"]')
      .fill("Kort, varmt och personligt.");
    await page.getByRole("button", { name: "Spara aktivitet" }).click();
    await page.waitForURL(/\/calendar\/[^/]+$/);
    await expect(page.getByText(/Nästa \d/)).toBeVisible();
    await expect(
      page.getByText(/AI skapar ett personligt SMS-utkast/),
    ).toBeVisible();
    await page.getByRole("button", { name: `Tillbaka till ${TERMS.calendar}` }).click();
    await expect(page).toHaveURL(/\/calendar$/);

    await page.goto("/activity");
    await expect(
      page.getByText(/Aktivitet skapad/).first(),
    ).toBeVisible();

    await page.goto("/settings");
    await page.getByRole("tab", { name: "Profil" }).click();
    await autosaveInput(page, "name", "Owner");
    await autosaveInput(page, "company", "Landvex");
    await autosaveInput(page, "jobTitle", "Grundare");
    const companyLogo = await sharp({
      create: {
        width: 240,
        height: 80,
        channels: 3,
        background: { r: 10, g: 40, b: 120 },
      },
    })
      .png()
      .toBuffer();
    await page.locator('[data-testid="company-logo-input"]').setInputFiles({
      name: "landvex.png",
      mimeType: "image/png",
      buffer: companyLogo,
    });
    await expect(page.getByRole("button", { name: "Byt logga" })).toBeVisible();
    await page.goto("/me/share");
    await expect(page.getByText("Landvex", { exact: true })).toBeVisible();
    await expect(page.getByText("Grundare", { exact: true })).toBeVisible();
    await expect(page.getByAltText("Logga för Landvex")).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACTS}/owner-company-logo.png`,
      fullPage: true,
      caret: "initial",
    });
    await page.goto("/settings?section=profile");
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
    await page.getByRole("tab", { name: "Samtal" }).click();
    await expect(page.locator('select[name="enabled"]')).toBeVisible();
    await expect(page.locator('select[name="availabilityMode"]')).toBeVisible();
    await expect(page.locator('textarea[name="greetingText"]')).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Skapa röstfraser med min AI-röst",
      }),
    ).toBeVisible();
    await autosaveSelect(page, "knownContacts", "RING_THROUGH");
    await autosaveSelect(page, "unknownCallers", "VOICEMAIL");
    await autosaveInput(page, "nightStart", "22:00");
    await autosaveInput(page, "nightEnd", "07:00");
    await autosaveInput(page, "nightPriorityThreshold", "85");
    await expect(page.locator('select[name="unknownCallers"]')).toHaveValue(
      "VOICEMAIL",
    );
    await page.getByRole("tab", { name: "Diagnostik" }).click();
    await expect(page.getByText("Systemhälsa")).toBeVisible();
    await expect(page.getByText("AI-modeller")).toBeVisible();
    await page.getByRole("tab", { name: "Integrationer" }).click();
    await expect(page.locator('select[name="provider"]')).toHaveValue("46elks");
    await expect(page.locator('input[name="accountSid"]')).toBeVisible();
    await expect(page.getByText("Alternativ adapter för SMS och MMS.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Apollo" })).toBeVisible();
    await expect(page.locator('textarea[name="defaultTitles"]')).toBeVisible();
    await expect(page.locator('input[name="defaultPersonLocations"]')).toBeVisible();
    await expect(page.locator('input[name="masterKey"]')).toBeVisible();
    await autosaveInput(page, "username", "u_e2e");
    await autosaveInput(page, "password", "p_e2e");
    await autosaveInput(page, "fromNumber", "+46701112233");
    await autosaveInput(page, "apiKey", "xi_e2e");
    await autosaveInput(page, "voiceId", "voice_e2e");
    await autosaveInput(page, "modelId", "eleven_multilingual_v2");
    await autosaveInput(page, "masterKey", "apollo_e2e");
    await autosaveInput(page, "defaultTitles", "VD, CEO");
    await autosaveInput(page, "defaultPersonLocations", "Sverige");
    await expect(
      page.getByRole("heading", { name: "Skapa “Min röst”" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Detta är min egen röst/).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Starta inspelning" }).click();
    await page.waitForTimeout(1_500);
    await page.getByRole("button", { name: /Stoppa/ }).click();
    await expect(page.locator("audio").last()).toBeVisible();
    await expect(page.getByText(/Spela in minst 30 sekunder/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Skapa Min röst" })).toBeDisabled();
    await page.screenshot({
      path: `${ARTIFACTS}/apple-settings-autosave.png`,
      fullPage: true,
      caret: "initial",
    });
    await page.reload();
    await expect(page.locator('input[name="fromNumber"]').first()).toHaveValue(
      "+46701112233",
    );
    await expect(page.locator('input[name="voiceId"]')).toHaveValue("voice_e2e");
    await expect(page.locator('input[name="password"]')).toHaveValue("");
    await expect(page.locator('input[name="apiKey"]')).toHaveValue("");
    await expect(page.locator('input[name="defaultPersonLocations"]')).toHaveValue(
      "Sverige",
    );
    await expect(page.locator('textarea[name="defaultTitles"]')).toHaveValue(
      "VD, CEO",
    );
    await page.goto("/apollo");
    await expect(page.getByRole("heading", { name: "Apollo" })).toBeVisible();
    await expect(page.getByText("Målgrupp / titel")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hämta telefonnummer" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Målgrupp / titel" })).toHaveValue(/VD/);
    await expect(page.locator('input[name="personLocations"]').first()).toHaveValue(
      "Sverige",
    );
    await page.screenshot({
      path: `${ARTIFACTS}/apollo-search.png`,
      fullPage: true,
      caret: "initial",
    });
    await page.goto("/settings?section=integrations");
    await page
      .getByRole("heading", { name: "46elks" })
      .locator("xpath=../../..")
      .screenshot({
        path: `${ARTIFACTS}/apple-provider-settings.png`,
        caret: "initial",
      });
    await page.getByRole("tab", { name: "Profil" }).click();
    await expect(page.getByRole("button", { name: "Logga ut" })).toBeVisible();
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
    await page.getByRole("button", { name: "Meddela" }).click();
    await page.waitForURL(/\/messages\/[^/]+$/);
    const conversationPath = new URL(page.url()).pathname;

    const deepRoutes = [
      {
        path: "/people/new",
        label: `Tillbaka till ${TERMS.contacts}`,
        expected: "/people",
      },
      {
        path: contactHref!,
        label: `Tillbaka till ${TERMS.contacts}`,
        expected: "/people",
      },
      {
        path: `${contactHref}/edit`,
        label: `Tillbaka till ${TERMS.contact}`,
        expected: contactHref!,
      },
      {
        path: conversationPath,
        label: `Tillbaka till ${TERMS.messages}`,
        expected: "/messages",
      },
      {
        path: "/messages/broadcast",
        label: `Tillbaka till ${TERMS.messages}`,
        expected: "/messages",
      },
      {
        path: "/messages/new",
        label: `Tillbaka till ${TERMS.messages}`,
        expected: "/messages",
      },
      {
        path: "/calendar/new",
        label: `Tillbaka till ${TERMS.calendar}`,
        expected: "/calendar",
      },
      {
        path: "/apollo",
        label: `Tillbaka till ${TERMS.contacts}`,
        expected: "/people",
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
      "/activity",
      "/settings",
    ]) {
      await page.goto("about:blank");
      await page.goto(path);
      await page.getByRole("button", { name: `Tillbaka till ${TERMS.more}` }).click();
      await expect(page).toHaveURL(/\/more$/);
    }
  });
});
