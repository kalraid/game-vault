import { ExpressAuth, getSession } from "@auth/express";
import type { ExpressAuthConfig } from "@auth/express";
import Credentials from "@auth/core/providers/credentials";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./db.js";

export const GUEST_COOKIE_NAME = "gv_guest";

// This cookie value is just a plain (unsigned) user id, not a signed/encrypted
// token — it is not tamper-proof. That matches this project's dev-pragmatic
// security posture (see ADR-0001's iframe-sandbox section for the same stance);
// don't treat it as a hardened session credential.
const GUEST_COOKIE_PATH = "/";
const GUEST_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 365 * 24 * 60 * 60 * 1000,
  path: GUEST_COOKIE_PATH
};

export const authConfig: ExpressAuthConfig = {
  trustHost: true,
  providers: [
    Credentials({
      name: "Development Login",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" }
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "dev@example.com").trim().toLowerCase();
        const displayName = String(credentials?.name || "Developer").trim();
        const user = await prisma.user.upsert({
          where: { email },
          update: { displayName, isGuest: false },
          create: { email, displayName, isGuest: false }
        });

        return {
          id: user.id,
          email: user.email,
          name: user.displayName || user.email
        };
      }
    })
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub);
      }
      return session;
    }
  }
};

export const authHandler = ExpressAuth(authConfig);

export type ApiUser = {
  id: string;
  email: string | null;
  isGuest: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: ApiUser;
    }
  }
}

/**
 * Resolves every /api/* request to a real identity:
 *  1. A real Auth.js session, if one exists (a logged-in account).
 *  2. Otherwise, a guest identity tracked via the gv_guest cookie — reused if
 *     present and valid, created (and the cookie (re)issued) if not.
 *
 * A game module talking through the SDK contract never sees the difference.
 */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const session = await getSession(req, authConfig);
  const sessionUserId = session?.user?.id ? String(session.user.id) : null;

  if (sessionUserId) {
    const user = await resolveSessionUser({
      id: sessionUserId,
      email: session?.user?.email,
      name: session?.user?.name
    });
    req.user = { id: user.id, email: user.email, isGuest: false };
    next();
    return;
  }

  const guestId = readGuestCookie(req);
  const guestUser = guestId ? await prisma.user.findUnique({ where: { id: guestId } }) : null;

  if (guestUser && guestUser.isGuest) {
    req.user = { id: guestUser.id, email: guestUser.email, isGuest: true };
    next();
    return;
  }

  const created = await prisma.user.create({
    data: { email: null, isGuest: true }
  });
  res.cookie(GUEST_COOKIE_NAME, created.id, GUEST_COOKIE_OPTIONS);
  req.user = { id: created.id, email: created.email, isGuest: true };
  next();
}

/**
 * Runs the login-promotion decision described in ADR-0002, once, right after
 * a guest completes login. Called explicitly by the client — not hooked into
 * Auth.js's internal callbacks — so it stays simple and testable.
 */
export async function promoteGuest(req: Request, res: Response) {
  const session = await getSession(req, authConfig);
  const sessionUserId = session?.user?.id ? String(session.user.id) : null;

  if (!sessionUserId) {
    res.status(401).json({ error: "no active session" });
    return;
  }

  const accountUser = await resolveSessionUser({
    id: sessionUserId,
    email: session?.user?.email,
    name: session?.user?.name
  });

  const guestId = readGuestCookie(req);
  if (!guestId || guestId === accountUser.id) {
    clearGuestCookie(res);
    res.json({ promoted: false, reason: "no-guest-session" });
    return;
  }

  const guestUser = await prisma.user.findUnique({ where: { id: guestId } });
  if (!guestUser || !guestUser.isGuest) {
    clearGuestCookie(res);
    res.json({ promoted: false, reason: "no-guest-session" });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const [saveCount, accountDataCount] = await Promise.all([
      tx.gameSave.count({ where: { userId: accountUser.id } }),
      tx.accountData.count({ where: { userId: accountUser.id } })
    ]);

    if (saveCount === 0 && accountDataCount === 0) {
      // Account has no data of its own yet: re-point the guest's rows wholesale.
      await tx.gameSave.updateMany({
        where: { userId: guestUser.id },
        data: { userId: accountUser.id }
      });
      await tx.accountData.updateMany({
        where: { userId: guestUser.id },
        data: { userId: accountUser.id }
      });
      // The guest row is now empty of its own save/account data; delete it.
      // (Any leftover RealtimeEvent rows for the guest cascade-delete with it.)
      await tx.user.delete({ where: { id: guestUser.id } });
      return { promoted: true as const };
    }

    // Account already has data of its own: discard the guest session's data
    // entirely rather than merge it. Cascade delete removes its GameSave /
    // AccountData / RealtimeEvent rows along with the guest User row.
    await tx.user.delete({ where: { id: guestUser.id } });
    return { promoted: false as const, reason: "existing-data" as const };
  });

  clearGuestCookie(res);
  res.json(result);
}

function readGuestCookie(req: Request): string | null {
  const value = (req as Request & { cookies?: Record<string, string> }).cookies?.[GUEST_COOKIE_NAME];
  return typeof value === "string" && value ? value : null;
}

function clearGuestCookie(res: Response) {
  res.clearCookie(GUEST_COOKIE_NAME, { path: GUEST_COOKIE_PATH });
}

async function resolveSessionUser(sessionUser: {
  id: string;
  email?: string | null;
  name?: string | null;
}) {
  const existing = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (existing) {
    return existing;
  }

  // Defensive fallback: normally the Credentials authorize() upsert already
  // created this row, but guard against a missing row anyway.
  const email = sessionUser.email ? sessionUser.email.trim().toLowerCase() : null;
  return prisma.user.create({
    data: { id: sessionUser.id, email, displayName: sessionUser.name ?? null, isGuest: false }
  });
}
