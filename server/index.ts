import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { authHandler } from "./auth.js";
import { router } from "./routes.js";

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT || 3000);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const io = new Server(server, {
  cors: { origin: clientOrigin, credentials: true }
});

app.set("io", io);
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use("/auth/*", authHandler);
app.use("/api", router);

const staticRoot = path.resolve(process.cwd(), "dist");
app.use(express.static(staticRoot));
app.get("*", (_req, res) => {
  res.sendFile(path.join(staticRoot, "index.html"));
});

io.on("connection", (socket) => {
  const userId = String(socket.handshake.auth.userId || "");
  if (userId) {
    socket.join(userId);
  }
});

server.listen(port, () => {
  console.log(`GameVault portal server listening on http://localhost:${port}`);
});
