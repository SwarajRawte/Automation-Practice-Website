import AxeBuilder from "@axe-core/playwright";
import { expect, loginAs, test } from "./fixtures";

test("the accessible example has no detectable axe violations", async ({
  lab,
  page,
}) => {
  await loginAs(page, lab, "user", "/accessibility/good");
  await expect(page.getByTestId("accessible-example")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include('[data-testid="accessible-example"]')
    .analyze();

  expect(
    results.violations,
    results.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join("\n"),
  ).toEqual([]);
});
