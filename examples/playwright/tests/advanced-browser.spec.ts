import { expect, loginAs, test } from "./fixtures";

test("rich editor and non-drag graphics alternatives expose stable state", async ({
  lab,
  page,
}) => {
  await loginAs(page, lab, "user", "/advanced/editor");
  const editor = page.getByTestId("rich-editor");
  await editor.fill("Accessible rich editor fixture");
  await editor.selectText();
  await page.getByTestId("editor-bold").click();
  await expect(editor.locator("strong")).toHaveText(
    "Accessible rich editor fixture",
  );
  await expect(page.getByTestId("editor-plain-text")).toContainText(
    "Accessible rich editor fixture",
  );

  await page.goto("/advanced/graphics");
  await page
    .getByRole("button", { name: "Select circle", exact: true })
    .last()
    .click();
  await expect(page.getByTestId("selected-shape")).toHaveText(
    "Selected shape: circle",
  );
  await page.getByRole("button", { name: "Right", exact: true }).click();
  await expect(page.getByTestId("canvas-position")).toHaveText(
    "Position: 110, 70",
  );
});

test("IndexedDB fixture can be written and read", async ({ lab, page }) => {
  await loginAs(page, lab, "user", "/advanced/browser-apis");
  await page.getByRole("button", { name: "Write fixture" }).click();
  await expect(page.getByTestId("indexeddb-status")).toHaveText(
    "Fixture written",
  );
  await page.getByRole("button", { name: "Read fixture" }).click();
  await expect(page.getByTestId("indexeddb-status")).toContainText(
    "offline test fixture",
    { ignoreCase: true },
  );
});

test("accessible OTP mechanism fills and verifies without transcription", async ({
  lab,
  page,
}) => {
  await loginAs(page, lab, "user", "/advanced/events");
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(page.getByTestId("otp-code").first()).toHaveText(/^\d{6}$/);
  await page.getByRole("button", { name: "Fill latest code" }).click();
  await expect(page.locator("[autocomplete=one-time-code]")).toHaveValue(
    /^\d{6}$/,
  );
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByTestId("otp-status")).toHaveText(
    "Sign-in code verified",
  );
  await expect(page.getByTestId("mock-mailbox")).toContainText("Used");
});

test("WCAG 2.2 acceptance checks cover focus, targets, dragging and authentication", async ({
  lab,
  page,
}) => {
  await loginAs(page, lab, "user", "/advanced/editor");
  const editor = page.getByTestId("rich-editor");
  await editor.focus();
  const editorBox = await editor.boundingBox();
  const headerBox = await page.locator(".topbar").boundingBox();
  expect(editorBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(editorBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);

  await page.goto("/advanced/graphics");
  const targets = page.locator(
    ".advanced-lab button, .advanced-lab [role=button]",
  );
  for (const target of await targets.all()) {
    const box = await target.boundingBox();
    expect(box, "interactive target is visible").not.toBeNull();
    expect(box!.width, "target width").toBeGreaterThanOrEqual(24);
    expect(box!.height, "target height").toBeGreaterThanOrEqual(24);
  }
  await expect(
    page.getByLabel("Move point without dragging").getByRole("button"),
  ).toHaveCount(4);

  await page.goto("/advanced/events");
  await expect(page.locator("[autocomplete=one-time-code]")).toHaveAttribute(
    "inputmode",
    "numeric",
  );
  await expect(
    page.getByRole("button", { name: "Fill latest code" }),
  ).toBeVisible();
});
