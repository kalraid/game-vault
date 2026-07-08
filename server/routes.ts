import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { promoteGuest, requireUser } from "./auth.js";
import { getGame, listGames } from "./games.js";
import { emitRealtimeEvent } from "./realtime.js";

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
  res.json(listGames());
});

router.post("/games/seed", async (_req, res) => {
  const seeded: Array<{
    id: string;
    title: string;
    description: string | null;
    iframeUrl: string;
    launchUrl: string | null;
    active: boolean;
  }> = [];
  for (const game of listGames()) {
    const record = await upsertGameRecord(game.id);
    if (record) {
      seeded.push(record);
    }
  }
  res.json(seeded);
});

router.post("/auth/promote-guest", promoteGuest);

router.use(requireUser);

router.get("/auth/token", (req, res) => {
  res.json({
    token: Buffer.from(`${req.user!.id}:${Date.now()}`).toString("base64url"),
    user: req.user
  });
});

router.get("/games/:gameId/save/:slot", async (req, res) => {
  const game = await ensureGameRecord(req.params.gameId);
  if (!game) {
    res.status(400).json({ error: "unknown game" });
    return;
  }
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
  const game = await ensureGameRecord(req.params.gameId);
  if (!game) {
    res.status(400).json({ error: "unknown game" });
    return;
  }
  const parsed = saveStoreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

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
      data: parsed.data.data as never
    },
    create: {
      userId: req.user!.id,
      gameId: game.id,
      slot: parsed.data.slot,
      schemaVersion: parsed.data.schema_version,
      data: parsed.data.data as never
    }
  });

  res.json({ schema_version: save.schemaVersion, data: save.data });
});

router.get("/account", async (req, res) => {
  const rows: Array<{
    key: string;
    schemaVersion: number;
    value: unknown;
  }> = await prisma.accountData.findMany({
    where: { userId: req.user!.id },
    orderBy: { key: "asc" }
  });
  const account: Record<string, { schema_version: number; value: unknown }> = {};
  for (const row of rows) {
    account[row.key] = { schema_version: row.schemaVersion, value: row.value };
  }
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
      value: parsed.data.value as never
    },
    create: {
      userId: req.user!.id,
      key: parsed.data.key,
      schemaVersion: parsed.data.schema_version,
      value: parsed.data.value as never
    }
  });

  res.json({ key: row.key, schema_version: row.schemaVersion, value: row.value });
});

router.post("/games/:gameId/realtime", async (req, res) => {
  const game = await ensureGameRecord(req.params.gameId);
  if (!game) {
    res.status(400).json({ error: "unknown game" });
    return;
  }
  const parsed = realtimeEmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const event = await prisma.realtimeEvent.create({
    data: {
      userId: req.user!.id,
      gameId: req.params.gameId,
      event: parsed.data.event,
      payload: parsed.data.payload as never
    }
  });

  emitRealtimeEvent(req.app.get("io"), req.user!.id, {
    gameId: req.params.gameId,
    event: parsed.data.event,
    payload: parsed.data.payload
  });
  res.json({ id: event.id, event: event.event, payload: event.payload });
});

async function ensureGame(gameId: string) {
  const game = getGame(gameId);
  if (!game) return null;
  return upsertGameRecord(gameId);
}

async function ensureGameRecord(gameId: string) {
  return ensureGame(gameId);
}

async function upsertGameRecord(gameId: string) {
  const game = getGame(gameId);
  if (!game) return null;
  return prisma.game.upsert({
    where: { id: game.id },
    update: {
      title: game.title,
      description: game.description ?? null,
      iframeUrl: game.iframeUrl,
      launchUrl: game.launchUrl ?? null,
      active: game.active ?? true
    },
    create: {
      id: game.id,
      title: game.title,
      description: game.description ?? null,
      iframeUrl: game.iframeUrl,
      launchUrl: game.launchUrl ?? null,
      active: game.active ?? true
    }
  });
}

export { router };
