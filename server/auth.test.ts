import cookieParser from "cookie-parser";
import express from "express";
import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    gameSave: {
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    accountData: {
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };

  const getSession = vi.fn();

  return { prisma, getSession };
});

vi.mock("./db.js", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@auth/express", () => ({
  ExpressAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getSession: mocks.getSession,
}));

import { GUEST_COOKIE_NAME, promoteGuest, requireUser } from "./auth.js";

describe("requireUser / promoteGuest (guest sessions + login promotion)", () => {
  let baseUrl = "";
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.get("/whoami", requireUser, (req, res) => {
      res.json({ user: req.user });
    });
    app.post("/promote", promoteGuest);

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
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn(mocks.prisma),
    );
  });

  it("issues a guest cookie and creates a guest user when there is no session and no cookie", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.prisma.user.create.mockResolvedValue({
      id: "guest-new",
      email: null,
      isGuest: true,
    });

    const response = await fetch(`${baseUrl}/whoami`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { id: "guest-new", email: null, isGuest: true },
    });

    expect(mocks.prisma.user.create).toHaveBeenCalledWith({
      data: { email: null, isGuest: true },
    });

    const setCookie = response.headers.get("set-cookie") || "";
    expect(setCookie).toContain(`${GUEST_COOKIE_NAME}=guest-new`);
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("reuses an existing guest cookie instead of creating a new guest user", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "guest-existing",
      email: null,
      isGuest: true,
    });

    const response = await fetch(`${baseUrl}/whoami`, {
      headers: { Cookie: `${GUEST_COOKIE_NAME}=guest-existing` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { id: "guest-existing", email: null, isGuest: true },
    });
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("resolves a real Auth.js session to a logged-in (non-guest) user", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "account-1", email: "player@example.com", name: "Player" },
    });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "account-1",
      email: "player@example.com",
      isGuest: false,
    });

    const response = await fetch(`${baseUrl}/whoami`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { id: "account-1", email: "player@example.com", isGuest: false },
    });
  });

  it("promotes a guest session onto an account with no existing data (re-points rows, deletes guest)", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "account-1", email: "player@example.com", name: "Player" },
    });
    mocks.prisma.user.findUnique.mockImplementation(async ({ where: { id } }: any) => {
      if (id === "account-1") return { id: "account-1", email: "player@example.com", isGuest: false };
      if (id === "guest-1") return { id: "guest-1", email: null, isGuest: true };
      return null;
    });
    mocks.prisma.gameSave.count.mockResolvedValue(0);
    mocks.prisma.accountData.count.mockResolvedValue(0);

    const response = await fetch(`${baseUrl}/promote`, {
      method: "POST",
      headers: { Cookie: `${GUEST_COOKIE_NAME}=guest-1` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ promoted: true });

    expect(mocks.prisma.gameSave.updateMany).toHaveBeenCalledWith({
      where: { userId: "guest-1" },
      data: { userId: "account-1" },
    });
    expect(mocks.prisma.accountData.updateMany).toHaveBeenCalledWith({
      where: { userId: "guest-1" },
      data: { userId: "account-1" },
    });
    expect(mocks.prisma.user.delete).toHaveBeenCalledWith({ where: { id: "guest-1" } });

    const setCookie = response.headers.get("set-cookie") || "";
    expect(setCookie).toContain(`${GUEST_COOKIE_NAME}=;`);
  });

  it("discards the guest session's data when the account already has data of its own", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "account-1", email: "player@example.com", name: "Player" },
    });
    mocks.prisma.user.findUnique.mockImplementation(async ({ where: { id } }: any) => {
      if (id === "account-1") return { id: "account-1", email: "player@example.com", isGuest: false };
      if (id === "guest-1") return { id: "guest-1", email: null, isGuest: true };
      return null;
    });
    mocks.prisma.gameSave.count.mockResolvedValue(2);
    mocks.prisma.accountData.count.mockResolvedValue(0);

    const response = await fetch(`${baseUrl}/promote`, {
      method: "POST",
      headers: { Cookie: `${GUEST_COOKIE_NAME}=guest-1` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      promoted: false,
      reason: "existing-data",
    });

    expect(mocks.prisma.gameSave.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.accountData.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.user.delete).toHaveBeenCalledWith({ where: { id: "guest-1" } });
  });

  it("no-ops when there is no active session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/promote`, { method: "POST" });
    expect(response.status).toBe(401);
  });

  it("no-ops when there is no guest cookie to promote", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "account-1", email: "player@example.com", name: "Player" },
    });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "account-1",
      email: "player@example.com",
      isGuest: false,
    });

    const response = await fetch(`${baseUrl}/promote`, { method: "POST" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      promoted: false,
      reason: "no-guest-session",
    });
    expect(mocks.prisma.user.delete).not.toHaveBeenCalled();
  });
});
