import { expect, loginAs, test } from "./fixtures";

test.describe("authentication and role-based access", () => {
  test("returns to a protected deep link and logs out", async ({
    page,
    lab,
  }) => {
    await loginAs(page, lab, "user", "/forms/basic");
    await expect(page).toHaveURL(/\/forms\/basic$/);
    await expect(
      page.getByRole("heading", { name: "Forms", exact: true }),
    ).toBeVisible();

    await page.getByTestId("user-menu").locator("summary").click();
    await page.getByTestId("logout-button").click();

    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(page.getByTestId("login-page")).toBeVisible();
  });

  test("denies the admin UI and API to non-admin users", async ({
    api,
    lab,
    page,
  }) => {
    await loginAs(page, lab, "viewer", "/admin");
    await expect(
      page.getByRole("heading", { name: "403 Forbidden" }),
    ).toBeVisible();

    const userSession = await lab.apiLogin("user");
    const denied = await api.get("/api/users", {
      headers: { authorization: `Bearer ${userSession.token}` },
    });
    expect(denied.status()).toBe(403);

    const adminSession = await lab.apiLogin("admin");
    const allowed = await api.get("/api/users?size=3", {
      headers: { authorization: `Bearer ${adminSession.token}` },
    });
    await expect(allowed).toBeOK();
    const body = (await allowed.json()) as { data: unknown[]; total: number };
    expect(body.data).toHaveLength(3);
    expect(body.total).toBe(100);
  });
});
