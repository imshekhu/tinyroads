import { io as createClient, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { createGameServer } from "../../server/index";
import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type JoinResult,
  type RoomSnapshot,
  type ServerToClientEvents,
} from "../../shared/protocol";

type TestClient = Socket<ServerToClientEvents, ClientToServerEvents>;

describe("multiplayer room server", () => {
  const clients: TestClient[] = [];
  const servers: ReturnType<typeof createGameServer>[] = [];

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    await Promise.all(servers.map((server) => server.close()));
    clients.length = 0;
    servers.length = 0;
  });

  async function connectClient(port: number) {
    const client: TestClient = createClient(`http://localhost:${port}`, {
      transports: ["websocket"],
      forceNew: true,
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("connect_error", reject);
    });
    return client;
  }

  it("matches players, simulates inputs, and broadcasts snapshots", async () => {
    const server = createGameServer();
    servers.push(server);
    const port = await server.listen(0);
    const client = await connectClient(port);

    const join = await new Promise<JoinResult>((resolve) => {
      client.emit(
        "room:join",
        {
          protocol: PROTOCOL_VERSION,
          name: "Test Driver",
          color: 0xff6633,
          mode: "race",
        },
        resolve,
      );
    });
    expect(join.ok).toBe(true);
    if (!join.ok) return;
    expect(join.snapshot.phase).toBe("countdown");

    const movingSnapshot = new Promise<RoomSnapshot>((resolve) => {
      const handler = (snapshot: RoomSnapshot) => {
        const player = snapshot.players.find(
          (entry) => entry.id === join.playerId,
        );
        if (player && player.speed > 0.05) {
          client.off("room:snapshot", handler);
          resolve(snapshot);
        }
      };
      client.on("room:snapshot", handler);
    });

    client.emit("player:input", {
      sequence: 1,
      throttle: 1,
      brake: 0,
      steering: 0.2,
      handbrake: false,
      boost: false,
      clientTime: 1,
    });
    const snapshot = await movingSnapshot;
    const player = snapshot.players.find(
      (entry) => entry.id === join.playerId,
    );
    expect(player?.lastInputSequence).toBe(1);
    expect(player?.speed).toBeGreaterThan(0);
    expect(snapshot.serverTick).toBeGreaterThan(0);
  });

  it("rejects incompatible protocol versions", async () => {
    const server = createGameServer();
    servers.push(server);
    const port = await server.listen(0);
    const client = await connectClient(port);
    const result = await new Promise<JoinResult>((resolve) => {
      client.emit(
        "room:join",
        {
          protocol: 999,
          name: "Old Driver",
          color: 0,
          mode: "race",
        } as never,
        resolve,
      );
    });
    expect(result).toEqual({ ok: false, reason: "protocol-mismatch" });
  });
});
