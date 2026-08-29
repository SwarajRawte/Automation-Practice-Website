import { expect, loginAs, test } from "./fixtures";

test.describe("forms and HTTP APIs", () => {
  test("shows client validation and persists a redacted submission", async ({
    lab,
    page,
  }) => {
    await loginAs(page, lab, "user", "/forms/validation");

    await page.locator('[name="name"]').fill("Playwright Tester");
    await page.locator('[name="email"]').fill("playwright@test.local");
    await page.locator('[name="password"]').fill("ValidPass1!");
    await page.locator('[name="confirmPassword"]').fill("DifferentPass1!");
    await page.getByTestId("form-submit").click();
    await expect(page.getByRole("alert")).toContainText("Passwords must match");

    await page.locator('[name="confirmPassword"]').fill("ValidPass1!");
    await page.locator('[name="employment"]').selectOption("Employed");
    await page.getByTestId("form-submit").click();
    await expect(page.getByRole("alert")).toContainText(
      "Company is required when employed",
    );

    await page.locator('[name="company"]').fill("Test Lab Inc.");
    await page.locator('[name="startDate"]').fill("2026-04-20");
    await page.locator('[name="endDate"]').fill("2026-04-19");
    await page.getByTestId("form-submit").click();
    await expect(page.getByRole("alert")).toContainText(
      "Start date must be before end date",
    );

    await page.locator('[name="endDate"]').fill("2026-04-21");
    await page.getByTestId("form-submit").click();
    await expect(page).toHaveURL(/\/forms\/confirmation$/);
    await expect(page.getByRole("status")).toHaveText(
      "Form submitted successfully",
    );
    await expect(page.getByRole("table")).toContainText("Playwright Tester");
    await expect(page.getByText("ValidPass1!", { exact: true })).toHaveCount(0);
  });

  test("validates API payloads and returns deterministic status metadata", async ({
    api,
    lab,
  }) => {
    const session = await lab.apiLogin("user");
    const headers = { authorization: `Bearer ${session.token}` };

    const invalid = await api.post("/api/forms", {
      data: {
        name: "X",
        email: "not-an-email",
        password: "short",
        confirmPassword: "different",
      },
      headers,
    });
    expect(invalid.status()).toBe(422);
    const invalidBody = (await invalid.json()) as {
      error: string;
      errors: Record<string, string>;
    };
    expect(invalidBody.error).toBe("Form validation failed");
    expect(Object.keys(invalidBody.errors)).toEqual(
      expect.arrayContaining(["name", "email", "password", "confirmPassword"]),
    );

    const valid = await api.post("/api/forms", {
      data: {
        name: "API Tester",
        email: "api.tester@test.local",
        password: "ValidPass1!",
        confirmPassword: "ValidPass1!",
      },
      headers,
    });
    expect(valid.status()).toBe(201);
    const validBody = (await valid.json()) as {
      data: Record<string, unknown>;
      id: number;
      message: string;
    };
    expect(validBody.id).toBeGreaterThan(0);
    expect(validBody.message).toBe("Form submitted successfully");
    expect(validBody.data).not.toHaveProperty("password");
    expect(validBody.data).not.toHaveProperty("confirmPassword");

    const teapot = await api.get("/api/status/418", { headers });
    expect(teapot.status()).toBe(418);
    expect(teapot.headers()["x-request-id"]).toMatch(/^req-/);
    const teapotBody = (await teapot.json()) as Record<string, unknown>;
    expect(teapotBody).toEqual(
      expect.objectContaining({
        status: 418,
        message: "Simulated HTTP 418",
      }),
    );
  });
});
