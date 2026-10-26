import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installWidgetMocks } from "./helpers/widgetMocks.mjs";

async function runAxe(page, selector) {
  return new AxeBuilder({ page }).include(selector).analyze();
}

async function mountAccessibilityWidget(page, { embedded = false } = {}) {
  await installWidgetMocks(page);
  // Keep core accessibility tests independent of the interactive demo's
  // optional model downloads, voice UI, and changing preview settings.
  const options = {
    isAgent: true,
    piiRedaction: false,
    useVoiceAgent: false,
    useAudioUpload: false,
    useImageUpload: true,
    showCopyButton: true,
    useEscalation: true,
    supportLink: "https://example.com/support",
    leadCollect: {
      mode: "before_escalation",
      fields: [
        { key: "name", label: "Name (text)", type: "text", required: true },
        { key: "email", label: "Email", type: "email", required: true },
        {
          key: "companySize",
          label: "Company Size",
          type: "select",
          required: true,
          placeholder: "Select a size",
          options: [{ value: "1-10", label: "1-10" }],
        },
      ],
    },
  };
  await page.route("**/accessibility-harness", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html lang="en"><head><title>Widget accessibility tests</title></head><body>
      <button id="before-widget">Before widget</button>
      ${embedded ? '<div id="docsbot-widget-embed" style="height:650px;max-width:600px"></div>' : ""}
      <script src="/chat.js"></script>
      <script>DocsBotAI.mount({id:"test/accessibility",options:${JSON.stringify(options)}})</script>
    </body></html>`,
  }));
  await page.goto("/accessibility-harness");
}

async function openFloatingWidget(page) {
  await mountAccessibilityWidget(page);

  const launcher = page.locator("#docsbotai-root").getByRole("button", {
    name: "Help",
  });
  await expect(launcher).toBeVisible();

  await page.getByRole("button", { name: "Before widget" }).focus();
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    if (await launcher.evaluate((element) => element.matches(":focus"))) {
      break;
    }
  }
  await expect(launcher).toBeFocused();

  await page.keyboard.press("Enter");

  const chatInput = page.locator("#docsbotai-root").locator("textarea");
  await expect(chatInput).toBeVisible();
  await expect(chatInput).toBeFocused();

  return { launcher, chatInput };
}

test("floating widget supports keyboard open and close with no critical axe violations", async ({
  page,
}) => {
  const { launcher } = await openFloatingWidget(page);

  const results = await runAxe(page, "#docsbotai-root");
  const criticalViolations = results.violations.filter(
    (violation) => violation.impact === "critical"
  );

  expect(criticalViolations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(launcher).toBeFocused();
});

test("chat flow exposes accessible controls and source links", async ({ page }) => {
  const { chatInput } = await openFloatingWidget(page);

  await chatInput.fill("Show me a source");
  await chatInput.press("Enter");

  const sourceLink = page.locator("#docsbotai-root").getByRole("link", {
    name: "Example source",
  });
  await expect(sourceLink).toBeVisible();

  await expect(
    page.locator("#docsbotai-root").getByRole("button", {
      name: "Copy response",
    })
  ).toBeVisible();
  await expect(
    page.locator("#docsbotai-root").getByRole("button", {
      name: "Upload image",
    })
  ).toBeVisible();
  await expect(
    page.locator("#docsbotai-root").getByRole("button", {
      name: "Submit",
    })
  ).toBeVisible();

  const results = await runAxe(page, "#docsbotai-root");
  const criticalViolations = results.violations.filter(
    (violation) => violation.impact === "critical"
  );

  expect(criticalViolations).toEqual([]);
});

test("lead capture form exposes labels and invalid state before support escalation", async ({
  page,
}) => {
  const { chatInput } = await openFloatingWidget(page);

  await chatInput.fill("I need support");
  await chatInput.press("Enter");

  const supportButton = page.locator("#docsbotai-root").getByRole("button", {
    name: "Contact support",
  });
  await expect(supportButton).toBeVisible();
  await supportButton.press("Enter");

  const nameField = page.locator("#docsbotai-root").getByLabel("Name (text)");
  const emailField = page.locator("#docsbotai-root").getByLabel("Email");
  const companySizeField = page
    .locator("#docsbotai-root")
    .getByLabel("Company Size");
  await expect(nameField).toBeVisible();
  await expect(emailField).toBeVisible();
  await expect(companySizeField).toBeVisible();

  await nameField.fill("A11y Tester");

  await expect(emailField).not.toHaveAttribute("aria-invalid", "true");
  await expect(companySizeField).not.toHaveAttribute("aria-invalid", "true");
  await expect(
    page
      .locator("#docsbotai-root")
      .getByRole("alert")
  ).toHaveCount(0);

  await emailField.focus();
  await page.keyboard.press("Tab");

  await expect(emailField).toHaveAttribute("aria-invalid", "true");
  await expect(companySizeField).not.toHaveAttribute("aria-invalid", "true");
  await expect(
    page.locator("#docsbotai-root").getByRole("alert")
  ).toHaveCount(1);
  await expect(
    page
      .locator("#docsbotai-root")
      .locator(".docsbot-chat-lead-message-container")
      .getByRole("button", { name: "Continue" })
  ).toBeEnabled();
  await page
    .locator("#docsbotai-root")
    .locator(".docsbot-chat-lead-message-container")
    .getByRole("button", { name: "Continue" })
    .click();

  await expect(emailField).toHaveAttribute("aria-invalid", "true");
  await expect(companySizeField).toHaveAttribute("aria-invalid", "true");
  // Exercise native submission from the keyboard after the blur errors render.
  await page.locator("#docsbotai-root")
    .getByRole("button", { name: "Continue" }).press("Enter");
  await expect(emailField).toBeFocused();
  await expect(emailField).toHaveAccessibleDescription(
    /Please fill out required fields/
  );
  await expect(companySizeField).toHaveAccessibleDescription(
    /Please fill out required fields/
  );
  await expect(
    page.locator("#docsbotai-root").getByRole("alert")
  ).toHaveCount(2);

  const results = await runAxe(page, "#docsbotai-root");
  expect(results.violations.filter(
    violation => violation.impact === "critical"
  )).toEqual([]);

  await emailField.fill("a11y@example.com");
  await page.locator("#docsbotai-root")
    .getByRole("button", { name: "Continue" }).press("Enter");
  await expect(companySizeField).toBeFocused();
  await companySizeField.selectOption("1-10");
  await expect(emailField).not.toHaveAttribute("aria-invalid", "true");
  await expect(companySizeField).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#docsbotai-root")
    .getByRole("alert")).toHaveCount(0);
});

test("embedded mode renders the chat surface with no critical axe violations", async ({
  page,
}) => {
  await mountAccessibilityWidget(page, { embedded: true });

  const chatInput = page.locator("#docsbot-widget-embed").locator("textarea");
  await expect(chatInput).toBeVisible();
  await expect(chatInput).toHaveAttribute(
    "aria-labelledby",
    /.+/
  );

  const results = await runAxe(page, "#docsbot-widget-embed");
  const criticalViolations = results.violations.filter(
    (violation) => violation.impact === "critical"
  );

  expect(criticalViolations).toEqual([]);
});
