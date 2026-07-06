import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db.js";
import { requireUser } from "./auth.js";

const router = Router();

const jsonSchema = z.unknown();
const saveStoreSchema = z.object({
  slot: z.number().int().min(0).max(99),
  schema_version: z.number().int().min(1),
  data: jsonSchema
});
const accountSetSchema = z.object({
  key: z.string().min(1).max(100),
  schema_version: z.number().int().min(1),
  value: jsonSchema
});
const realtimeEmitSchema = z.object({
  event: z.string().min(1).max(100),
  payload: jsonSchema
});

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.get("/games", async (_req, res) => {
  const games = await prisma.game.findMany({
    where: { active: true },
    orderBy: { title: "asc" }
  });
  res.json(games);
});

router.post("/games/seed", async (_req, res) => {
  const game = await prisma.game.upsert({
    where: { id: "lords-daughter" },
    update: {
      title: "Lord's Daughter",
      description: "Mock integration target for the GameVault portal SDK.",
      iframeUrl: "/mock-game.html?gameId=lords-daughter",
      launchUrl: "/mock-game.html?gameId=lords-daughter"
    },
    create: {
      id: "lords-daughter",
      title: "Lord's Daughter",
      description: "Mock integration target for the GameVault portal SDK.",
      iframeUrl: "/mock-game.html?gameId=lords-daughter",
      launchUrl: "/mock-game.html?gameId=lords-daughter"
    }
  });
  res.json(game);
});

router.use(requireUser);

router.get("/auth/token", (req, res) => {
  res.json({
    token: Buffer.from(`${req.user!.id}:${Date.now()}`).toString("base64url"),
    user: req.user
  });
});

router.get("/games/:gameId/save/:slot", async (req, res) => {
  const slot = Number(req.params.slot);
  if (!Number.isInteger(slot)) {
    res.status(400).json({ error: "slot must be an integer" });
    return;
  }

  const save = await prisma.gameSave.findUnique({
    where: {
      userId_gameId_slot: {
        userId: req.user!.id,
        gameId: req.params.gameId,
        slot
      }
    }
  });

  res.json(save ? { schema_version: save.schemaVersion, data: save.data } : null);
});

router.put("/games/:gameId/save", async (req, res) => {
  const parsed = saveStoreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const game = await ensureGame(req.params.gameId);
  const save = await prisma.gameSave.upsert({
    where: {
      userId_gameId_slot: {
        userId: req.user!.id,
        gameId: game.id,
        slot: parsed.data.slot
      }
    },
    update: {
      schemaVersion: parsed.data.schema_version,
      data: toPrismaJson(parsed.data.data)
    },
    create: {
      userId: req.user!.id,
      gameId: game.id,
      slot: parsed.data.slot,
      schemaVersion: parsed.data.schema_version,
      data: toPrismaJson(parsed.data.data)
    }
  });

  res.json({ schema_version: save.schemaVersion, data: save.data });
});

router.get("/account", async (req, res) => {
  const rows = await prisma.accountData.findMany({
    where: { userId: req.user!.id },
    orderBy: { key: "asc" }
  });
  const account = rows.reduce<Record<string, { schema_version: number; value: unknown }>>(
    (acc, row) => {
      acc[row.key] = { schema_version: row.schemaVersion, value: row.value };
      return acc;
    },
    {}
  );
  res.json(account);
});

router.put("/account", async (req, res) => {
  const parsed = accountSetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const row = await prisma.accountData.upsert({
    where: {
      userId_key: {
        userId: req.user!.id,
        key: parsed.data.key
      }
    },
    update: {
      schemaVersion: parsed.data.schema_version,
      value: toPrismaJson(parsed.data.value)
    },
    create: {
      userId: req.user!.id,
      key: parsed.data.key,
      schemaVersion: parsed.data.schema_version,
      value: toPrismaJson(parsed.data.value)
    }
  });

  res.json({ key: row.key, schema_version: row.schemaVersion, value: row.value });
});

router.post("/games/:gameId/realtime", async (req, res) => {
  const parsed = realtimeEmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  await ensureGame(req.params.gameId);
  const event = await prisma.realtimeEvent.create({
    data: {
      userId: req.user!.id,
      gameId: req.params.gameId,
      event: parsed.data.event,
      payload: toPrismaJson(parsed.data.payload)
    }
  });

  req.app.get("io")?.to(req.user!.id).emit(parsed.data.event, parsed.data.payload);
  res.json({ id: event.id, event: event.event, payload: event.payload });
});

async function ensureGame(gameId: string) {
  return prisma.game.upsert({
    where: { id: gameId },
    update: {},
    create: {
      id: gameId,
      title: gameId,
      iframeUrl: `/mock-game.html?gameId=${encodeURIComponent(gameId)}`,
      launchUrl: `/mock-game.html?gameId=${encodeURIComponent(gameId)}`
    }
  });
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export { router };
