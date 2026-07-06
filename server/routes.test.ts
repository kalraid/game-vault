import express from "express";
import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    game: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    gameSave: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    accountData: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    realtimeEvent: {
      create: vi.fn(),
    },
  };

  const emit = vi.fn();
  const requireUser = vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: "user-1", email: "dev@example.com" };
    next();
  });

  return { prisma, emit, requireUser };
});

vi.mock("./db.js", () => ({
  prisma: mocks.prisma,
}));

vi.mock("./auth.js", () => ({
  requireUser: mocks.requireUser,
}));

import { router } from "./routes.js";

describe("portal API contract", () => {
  let baseUrl = "";
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.set("io", {
      to: () => ({
        emit: mocks.emit,
      }),
    });
    app.use("/api", router);

    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves health and game listing", async () => {
    mocks.prisma.game.findMany.mockResolvedValue([
      { id: "beta", title: "Beta" },
      { id: "alpha", title: "Alpha" },
    ]);

    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ ok: true });

    const games = await fetch(`${baseUrl}/api/games`);
    expect(games.status).toBe(200);
    await expect(games.json()).resolves.toEqual([
      { id: "beta", title: "Beta" },
      { id: "alpha", title: "Alpha" },
    ]);
    expect(mocks.prisma.game.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { title: "asc" },
    });
  });

  it("seeds the mock game and exposes auth token", async () => {
    mocks.prisma.game.upsert.mockResolvedValue({
      id: "lords-daughter",
      title: "Lord's Daughter",
      description: "Mock integration target for the GameVault portal SDK.",
      iframeUrl: "/mock-game.html?gameId=lords-daughter",
      launchUrl: "/mock-game.html?gameId=lords-daughter",
    });

    const seed = await fetch(`${baseUrl}/api/games/seed`, { method: "POST" });
    expect(seed.status).toBe(200);
    await expect(seed.json()).resolves.toMatchObject({
      id: "lords-daughter",
      title: "Lord's Daughter",
    });
    expect(mocks.prisma.game.upsert).toHaveBeenCalledWith({
      where: { id: "lords-daughter" },
      update: expect.objectContaining({
        title: "Lord's Daughter",
      }),
      create: expect.objectContaining({
        id: "lords-daughter",
      }),
    });

    const token = await fetch(`${baseUrl}/api/auth/token`);
    expect(token.status).toBe(200);
    await expect(token.json()).resolves.toMatchObject({
      user: { id: "user-1", email: "dev@example.com" },
    });
  });

  it("loads and stores saves", async () => {
    mocks.prisma.gameSave.findUnique.mockResolvedValue({
      schemaVersion: 1,
      data: { hp: 12 },
    });
    mocks.prisma.game.upsert.mockResolvedValue({ id: "lords-daughter" });
    mocks.prisma.gameSave.upsert.mockResolvedValue({
      id: "save-1",
      schemaVersion: 2,
      data: { hp: 13 },
    });

    const load = await fetch(`${baseUrl}/api/games/lords-daughter/save/0`);
    expect(load.status).toBe(200);
    await expect(load.json()).resolves.toEqual({
      schema_version: 1,
      data: { hp: 12 },
    });

    const store = await fetch(`${baseUrl}/api/games/lords-daughter/save`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot: 0,
        schema_version: 2,
        data: { hp: 13 },
      }),
    });
    expect(store.status).toBe(200);
    await expect(store.json()).resolves.toEqual({
      schema_version: 2,
      data: { hp: 13 },
    });
    expect(mocks.prisma.gameSave.upsert).toHaveBeenCalledWith({
      where: {
        userId_gameId_slot: {
          userId: "user-1",
          gameId: "lords-daughter",
          slot: 0,
        },
      },
      update: {
        schemaVersion: 2,
        data: { hp: 13 },
      },
      create: {
        userId: "user-1",
        gameId: "lords-daughter",
        slot: 0,
        schemaVersion: 2,
        data: { hp: 13 },
      },
    });
  });

  it("loads and stores account data", async () => {
    mocks.prisma.accountData.findMany.mockResolvedValue([
      { key: "flag", schemaVersion: 1, value: true },
    ]);
    mocks.prisma.accountData.upsert.mockResolvedValue({
      key: "flag",
      schemaVersion: 2,
      value: false,
    });

    const account = await fetch(`${baseUrl}/api/account`);
    expect(account.status).toBe(200);
    await expect(account.json()).resolves.toEqual({
      flag: { schema_version: 1, value: true },
    });

    const update = await fetch(`${baseUrl}/api/account`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "flag",
        schema_version: 2,
        value: false,
      }),
    });
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toEqual({
      key: "flag",
      schema_version: 2,
      value: false,
    });
  });

  it("persists realtime events and fans them out to the socket layer", async () => {
    mocks.prisma.game.upsert.mockResolvedValue({ id: "lords-daughter" });
    mocks.prisma.realtimeEvent.create.mockResolvedValue({
      id: "event-1",
      event: "achievement.unlocked",
      payload: { id: "mock_start" },
    });

    const response = await fetch(`${baseUrl}/api/games/lords-daughter/realtime`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "achievement.unlocked",
        payload: { id: "mock_start" },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "event-1",
      event: "achievement.unlocked",
      payload: { id: "mock_start" },
    });
    expect(mocks.emit).toHaveBeenCalledWith("gamevault:realtime-event", {
      gameId: "lords-daughter",
      event: "achievement.unlocked",
      payload: { id: "mock_start" },
    });
  });
});
