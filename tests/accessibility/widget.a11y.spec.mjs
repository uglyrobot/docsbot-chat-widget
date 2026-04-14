import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installWidgetMocks } from "./helpers/widgetMocks.mjs";

async function runAxe(page, selector) {
  return new AxeBuilder({ page }).include(selector).analyze();
}

async function openFloatingWidget(page) {
  await installWidgetMocks(page);
  await page.goto("/");

  const launcher = page.locator("#docsbotai-root").getByRole("button", {
    name: "Help",
  });
  await expect(launcher).toBeVisible();

  await page.getByRole("button", { name: "Add Bot Message" }).focus();
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
  await supportButton.click();

  const nameField = page.locator("#docsbotai-root").getByLabel("Name (text)");
  const emailField = page.locator("#docsbotai-root").getByLabel("Email");
  const companySizeField = page
    .locator("#docsbotai-root")
    .getByLabel("Company Size");
  await expect(nameField).toBeVisible();
  await expect(emailField).toBeVisible();
  await expect(companySizeField).toBeVisible();

  await nameField.fill("A11y Tester");

  await expect(emailField).toHaveAttribute("aria-invalid", "true");
  await expect(companySizeField).toHaveAttribute("aria-invalid", "true");
  await expect(
    page
      .locator("#docsbotai-root")
      .getByText("Please fill out required fields.")
      .first()
  ).toBeVisible();
  await expect(
    page
      .locator("#docsbotai-root")
      .locator(".docsbot-chat-lead-message-container")
      .getByRole("button", { name: "Continue" })
  ).toBeDisabled();
});

test("embedded mode renders the chat surface with no critical axe violations", async ({
  page,
}) => {
  await installWidgetMocks(page);
  await page.goto("/?embedded=1");

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
