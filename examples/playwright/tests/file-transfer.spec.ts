import { expect, loginAs, test } from "./fixtures";

test("uploads, removes, and downloads deterministic files", async ({
  lab,
  page,
}, testInfo) => {
  const reset = await lab.control(
    lab.run.isolated ? "/api/test/reset/uploads" : "/api/test/reset",
  );
  await expect(reset).toBeOK();
  await loginAs(page, lab, "user", "/files/upload");

  const fileName = `playwright-${testInfo.project.name}-${testInfo.retry}.txt`;
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from("Deterministic Playwright upload\n"),
  });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.locator('output[role="status"]')).toHaveText(
    "1 file(s) uploaded",
  );

  const uploaded = page.getByRole("listitem").filter({ hasText: fileName });
  await expect(uploaded).toContainText("32 bytes");
  await uploaded.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator('output[role="status"]')).toContainText(
    `${fileName} removed`,
  );
  await expect(uploaded).toHaveCount(0);

  await page.goto("/files/download");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download text" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("test-lab-download.txt");

  await page.getByRole("button", { name: "Failed download" }).click();
  await expect(page.locator('output[role="status"]')).toHaveText(
    "Simulated download failure",
  );
});
