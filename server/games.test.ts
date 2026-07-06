import { afterEach, describe, expect, it, vi } from "vitest";

describe("game registry", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("exposes the built-in mock game", async () => {
    const games = await import("./games.js");
    expect(games.listGames()).toEqual([
      {
        id: "lords-daughter",
        title: "Lord's Daughter",
        description: "Mock integration target for the GameVault portal SDK.",
        iframeUrl: "/mock-game.html?gameId=lords-daughter",
        launchUrl: "/mock-game.html?gameId=lords-daughter",
      },
    ]);
    expect(games.isKnownGame("lords-daughter")).toBe(true);
    expect(games.getGame("missing")).toBeUndefined();
  });

  it("supports overriding the registry with GAMES_JSON", async () => {
    vi.stubEnv(
      "GAMES_JSON",
      JSON.stringify([
        {
          id: "alpha",
          title: "Alpha",
          iframeUrl: "http://localhost:5501/alpha.html",
          launchUrl: "http://localhost:5501/alpha.html",
        },
        {
          id: "beta",
          title: "Beta",
          description: "Second module",
          iframeUrl: "http://localhost:5502/beta.html",
        },
      ]),
    );

    const games = await import("./games.js");
    expect(games.listGames()).toEqual([
      {
        id: "alpha",
        title: "Alpha",
        description: undefined,
        iframeUrl: "http://localhost:5501/alpha.html",
        launchUrl: "http://localhost:5501/alpha.html",
        active: undefined,
      },
      {
        id: "beta",
        title: "Beta",
        description: "Second module",
        iframeUrl: "http://localhost:5502/beta.html",
        launchUrl: undefined,
        active: undefined,
      },
    ]);
    expect(games.isKnownGame("beta")).toBe(true);
  });
});
