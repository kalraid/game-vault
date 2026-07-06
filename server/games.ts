import { env } from "node:process";

export interface Game {
  id: string;
  title: string;
  description?: string | null;
  iframeUrl: string;
  launchUrl?: string | null;
  active?: boolean;
}

const DEFAULT_GAMES: Game[] = [
  {
    id: "lords-daughter",
    title: "Lord's Daughter",
    description: "Mock integration target for the GameVault portal SDK.",
    iframeUrl: "/mock-game.html?gameId=lords-daughter",
    launchUrl: "/mock-game.html?gameId=lords-daughter",
  },
];

function loadGames(): Game[] {
  const raw = env.GAMES_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map(normalizeGame)
          .filter((game): game is Game => game !== null);
      }
    } catch {
      // Fall back to built-in defaults when the override is malformed.
    }
  }

  return DEFAULT_GAMES;
}

function normalizeGame(value: unknown): Game | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) return null;
  if (typeof candidate.iframeUrl !== "string" || !candidate.iframeUrl.trim()) return null;

  const game: Game = {
    id: candidate.id.trim(),
    title: candidate.title.trim(),
    description:
      typeof candidate.description === "string" ? candidate.description : undefined,
    iframeUrl: candidate.iframeUrl.trim(),
    launchUrl:
      typeof candidate.launchUrl === "string" ? candidate.launchUrl.trim() : undefined,
    active:
      typeof candidate.active === "boolean" ? candidate.active : undefined,
  };
  return game;
}

const GAMES = new Map(loadGames().map((game) => [game.id, game]));

export function getGame(id: string): Game | undefined {
  return GAMES.get(id);
}

export function listGames(): Game[] {
  return [...GAMES.values()];
}

export function isKnownGame(id: string): boolean {
  return GAMES.has(id);
}
