import { expect, loginAs, test } from "./fixtures";

test.describe("browser interaction contexts", () => {
  test("handles rich pointer actions", async ({ lab, page }) => {
    await loginAs(page, lab, "user", "/interactions/actions");

    const hoverTarget = page.getByTestId("actions-hover-target");
    await hoverTarget.hover();
    await page.getByTestId("hover-menu-item").click();
    await page.getByTestId("actions-click").click();
    await page.getByTestId("actions-double-click").dblclick();
    await page.getByTestId("actions-context-click").click({ button: "right" });
    await page
      .getByTestId("actions-drag-source")
      .dragTo(page.getByTestId("actions-drop-target"));
    await page.getByTestId("modifier-alpha").click();
    await page.getByTestId("modifier-bravo").click({ modifiers: ["Control"] });

    await expect(page.getByTestId("actions-drop-target")).toHaveText(
      "Drop successful",
    );
    await expect(page.getByTestId("modifier-alpha")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("modifier-bravo")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("actions-event-log")).toContainText(
      "Hidden hover action clicked",
    );
    await expect(page.getByTestId("actions-event-log")).toContainText(
      "Context click",
    );
  });

  test("switches windows and receives a child message", async ({
    lab,
    page,
  }) => {
    await loginAs(page, lab, "user", "/windows");

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Open new tab" }).click();
    const popup = await popupPromise;
    await expect(popup.getByTestId("context-id")).toHaveText(
      "Context identifier: tab-one",
    );
    await popup.getByRole("button", { name: "Message parent" }).click();
    await expect(
      page.getByRole("list", { name: "Window message log" }),
    ).toContainText("Received: hello from tab-one");
    await popup.close();
  });

  test("switches basic and nested iframe contexts", async ({ lab, page }) => {
    await loginAs(page, lab, "user", "/frames");

    const basic = page.frameLocator('iframe[title="Basic frame"]');
    await expect(basic.locator("#basic-text")).toHaveText(
      "Unique basic iframe",
    );
    await basic.locator("#basic-button").click();
    await expect(basic.locator("#basic-result")).toHaveText(
      "Basic action completed",
    );

    const outer = page.frameLocator('iframe[title="Nested frame"]');
    await expect(outer.locator("#outer-text")).toHaveText("Outer frame");
    const inner = outer.frameLocator('iframe[title="Nested inner frame"]');
    await inner.locator("#inner-button").click();
    await expect(inner.locator("#inner-result")).toHaveText(
      "Inner action completed",
    );
  });

  test("pierces open and nested shadow roots", async ({ lab, page }) => {
    await loginAs(page, lab, "user", "/shadow-dom");

    const host = page.getByTestId("open-shadow-host");
    await host.getByLabel("Shadow input").fill("inside shadow root");
    await host.getByRole("button", { name: "Shadow button" }).click();
    await expect(host.locator("#shadow-output")).toHaveText(
      "Open shadow button clicked",
    );
    await host.getByRole("button", { name: "Nested action" }).click();
    await expect(host.locator("#nested-output")).toHaveText(
      "Nested action completed",
    );

    await page
      .getByRole("button", { name: "Create dynamic shadow root" })
      .click();
    await expect(page.getByTestId("dynamic-shadow-host")).toBeVisible();
    await expect(page.getByTestId("closed-shadow-host")).toBeVisible();
  });
});
