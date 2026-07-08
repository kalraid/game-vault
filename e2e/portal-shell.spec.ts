import { test, expect } from "@playwright/test";

test.describe("Portal shell screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("loads game list and auto-selects the first game", async ({ page }) => {
    const navButton = page.locator("nav.game-list button", { hasText: "Lord's Daughter" });
    await expect(navButton).toBeVisible();
    await expect(navButton).toHaveClass(/active/);

    await expect(page.locator(".topbar h2")).toHaveText("Lord's Daughter");
    await expect(page.locator(".topbar p")).toHaveText(
      "Mock integration target for the GameVault portal SDK."
    );
  });

  test("renders the selected game inside an iframe with the right src", async ({ page }) => {
    const frame = page.locator(".game-frame-wrap iframe");
    await expect(frame).toHaveAttribute("src", "/mock-game.html?gameId=lords-daughter");
    await expect(frame).toHaveAttribute("title", "Lord's Daughter");
  });

  test("Open Window button is enabled and opens the launch URL in a new window", async ({
    page,
    context,
  }) => {
    const openButton = page.getByRole("button", { name: "Open Window" });
    await expect(openButton).toBeEnabled();

    const [popup] = await Promise.all([context.waitForEvent("page"), openButton.click()]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain("/mock-game.html?gameId=lords-daughter");
    await popup.close();
  });

  test("shows guest identity and a login form by default", async ({ page }) => {
    await expect(page.locator(".account-status")).toHaveText("Playing as guest");
    await expect(page.locator(".login-form input[type='email']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("shows empty state copy when no game is registered", async ({ page }) => {
    await page.route("**/api/games", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: [] });
      } else {
        await route.continue();
      }
    });
    await page.reload();

    await expect(page.locator(".topbar h2")).toHaveText("No game registered");
    await expect(page.locator(".topbar p")).toHaveText(
      "Register a game to start testing the portal SDK."
    );
    await expect(page.getByRole("button", { name: "Open Window" })).toBeDisabled();
    await expect(page.locator(".game-frame-wrap .empty")).toHaveText("No game selected.");
  });
});
