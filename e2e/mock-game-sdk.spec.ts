import { test, expect } from "@playwright/test";

test.describe("Mock game screen (embedded SDK contract)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".game-frame-wrap iframe")).toHaveAttribute(
      "src",
      "/mock-game.html?gameId=lords-daughter"
    );
  });

  test("reports embedded connection state on boot", async ({ page }) => {
    const frame = page.frameLocator(".game-frame-wrap iframe");
    await expect(frame.locator("#connectionState")).toHaveText("embedded in portal");
  });

  test("auth.getToken returns a token for the default guest identity", async ({ page }) => {
    const frame = page.frameLocator(".game-frame-wrap iframe");
    await frame.locator("#token").click();

    const authState = frame.locator("#authState");
    await expect(authState).toContainText("token");
    await expect(authState).toContainText('"isGuest": true');
  });

  test("save.store then save.load round-trips the same payload", async ({ page }) => {
    const frame = page.frameLocator(".game-frame-wrap iframe");

    await frame.locator("#store").click();
    const saveState = frame.locator("#saveState");
    await expect(saveState).toContainText("schema_version");
    await expect(saveState).toContainText("gold");
    const stored = await saveState.textContent();

    await frame.locator("#load").click();
    await expect(saveState).toHaveText(stored ?? "");
  });

  test("account.set/get persists a value under the requested key", async ({ page }) => {
    const frame = page.frameLocator(".game-frame-wrap iframe");

    await frame.locator("#account").click();
    const accountState = frame.locator("#accountState");
    await expect(accountState).toContainText("outer_god_front_club");
    await expect(accountState).toContainText("true");
  });

  test("subscribing then emitting realtime events updates state and subscription chips", async ({
    page,
  }) => {
    const frame = page.frameLocator(".game-frame-wrap iframe");

    await frame.locator("#subscribe").click();
    await expect(frame.locator("#subscriptionState .chip")).toHaveCount(2);
    await expect(frame.locator("#subscriptionState")).toContainText("achievement.unlocked");
    await expect(frame.locator("#subscriptionState")).toContainText("progress.updated");

    await frame.locator("#event").click();
    await expect(frame.locator("#realtimeState")).toContainText("achievement.unlocked");
    await expect(frame.locator("#realtimeState")).toContainText("mock_start");

    await frame.locator("#event2").click();
    await expect(frame.locator("#realtimeState")).toContainText("progress.updated");
    await expect(frame.locator("#realtimeState")).toContainText("42");
  });

  test("clear log resets the activity log", async ({ page }) => {
    const frame = page.frameLocator(".game-frame-wrap iframe");

    await frame.locator("#token").click();
    await expect(frame.locator("#log")).not.toHaveText("Ready.");

    await frame.locator("#clear").click();
    await expect(frame.locator("#log")).toHaveText("Ready.");
  });
});

test.describe("Mock game screen (standalone launch)", () => {
  test("reports standalone connection state when opened outside the portal iframe", async ({
    page,
  }) => {
    await page.goto("/mock-game.html?gameId=lords-daughter");
    await expect(page.locator("#connectionState")).toHaveText("opened as standalone window");
    await expect(page.locator("#log")).toContainText("standalone: open this page through the portal");
  });
});
