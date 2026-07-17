import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import {
  JoinRequestSchema,
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type JoinResult,
  type ServerToClientEvents,
} from "../shared/protocol";
import { RoomManager } from "./RoomManager";

export function createGameServer() {
  const app = express();
  const allowedOrigins = (
    process.env.CLIENT_URLS ||
    "http://localhost:5173,http://127.0.0.1:5173,http://10.0.0.84:5173,http://100.75.200.96:5173"
  )
    .split(",")
    .map((origin) => origin.trim());
  app.use(
    cors({
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    }),
  );
  app.disable("x-powered-by");

  const manager = new RoomManager();
  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      protocol: PROTOCOL_VERSION,
      rooms: manager.roomCount,
      players: manager.playerCount,
    });
  });

  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 16_384,
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  const memberships = new Map<string, ReturnType<RoomManager["findOrCreate"]>>();
  io.on("connection", (socket) => {
    socket.on("room:join", (rawRequest, acknowledge) => {
      const parsed = JoinRequestSchema.safeParse(rawRequest);
      if (!parsed.success) {
        const mismatch =
          typeof rawRequest === "object" &&
          rawRequest !== null &&
          "protocol" in rawRequest &&
          rawRequest.protocol !== PROTOCOL_VERSION;
        const result: JoinResult = {
          ok: false,
          reason: mismatch ? "protocol-mismatch" : "invalid-request",
        };
        acknowledge(result);
        return;
      }

      memberships.get(socket.id)?.remove(socket.id);
      const room = manager.findOrCreate(parsed.data.mode);
      const result = room.add(socket, parsed.data);
      if (result.ok) memberships.set(socket.id, room);
      acknowledge(result);
    });

    socket.once("disconnect", () => {
      memberships.get(socket.id)?.remove(socket.id);
      memberships.delete(socket.id);
    });
  });

  const tickRate = 30;
  const timer = setInterval(() => manager.update(1 / tickRate), 1000 / tickRate);
  timer.unref();

  return {
    app,
    io,
    httpServer,
    manager,
    listen(port: number) {
      return new Promise<number>((resolve) => {
        httpServer.listen(port, "0.0.0.0", () => {
          const address = httpServer.address();
          resolve(typeof address === "object" && address ? address.port : port);
        });
      });
    },
    close() {
      clearInterval(timer);
      return new Promise<void>((resolve) => {
        io.close(() => {
          if (httpServer.listening) httpServer.close(() => resolve());
          else resolve();
        });
      });
    },
  };
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 3001);
  const server = createGameServer();
  server.listen(port).then((activePort) => {
    console.log(`Tiny Roads multiplayer server listening on :${activePort}`);
  });
}
