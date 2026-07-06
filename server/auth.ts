import { ExpressAuth } from "@auth/express";
import Credentials from "@auth/core/providers/credentials";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./db.js";

export const authHandler = ExpressAuth({
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
          update: { displayName },
          create: { email, displayName }
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
});

export type ApiUser = {
  id: string;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: ApiUser;
    }
  }
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const devEmail = req.header("x-dev-user") || "dev@example.com";
  const user = await prisma.user.upsert({
    where: { email: devEmail },
    update: {},
    create: { email: devEmail, displayName: "Developer" }
  });

  req.user = { id: user.id, email: user.email };
  next();
}
