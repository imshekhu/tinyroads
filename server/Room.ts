import type { Socket } from "socket.io";
import {
  DriveInputSchema,
  MAX_PLAYERS_PER_ROOM,
  PowerUseSchema,
  PROTOCOL_VERSION,
  ScoreEventSchema,
  type ClientToServerEvents,
  type JoinRequest,
  type JoinResult,
  type NetworkMode,
  type RoomSnapshot,
  type ServerToClientEvents,
} from "../shared/protocol";
import {
  createServerPlayer,
  simulatePlayer,
  type ServerPlayer,
} from "./physics";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export class Room {
  readonly id: string;
  readonly mode: NetworkMode;
  readonly players = new Map<string, ServerPlayer>();
  readonly sockets = new Map<string, GameSocket>();
  readonly collectedBolts = new Set<number>();
  private readonly lastPowerAt = new Map<string, number>();

  private serverTick = 0;
  private phase: RoomSnapshot["phase"] = "waiting";
  private countdownEndsAt: number | null = null;
  private raceStartedAt: number | null = null;

  constructor(id: string, mode: NetworkMode) {
    this.id = id;
    this.mode = mode;
  }

  get full() {
    return this.players.size >= MAX_PLAYERS_PER_ROOM;
  }

  get empty() {
    return this.players.size === 0;
  }

  add(socket: GameSocket, request: JoinRequest): JoinResult {
    if (this.full) return { ok: false, reason: "room-full" };
    const player = createServerPlayer(
      socket.id,
      request.name,
      request.color,
      this.players.size,
    );
    this.players.set(socket.id, player);
    this.sockets.set(socket.id, socket);
    socket.join(this.id);

    socket.on("player:input", (rawInput) => {
      const parsed = DriveInputSchema.safeParse(rawInput);
      if (!parsed.success) return;
      const current = this.players.get(socket.id);
      if (
        !current ||
        parsed.data.sequence <= current.state.lastInputSequence
      ) {
        return;
      }
      current.input = parsed.data;
    });

    socket.on("score:event", (rawEvent) => {
      const parsed = ScoreEventSchema.safeParse(rawEvent);
      const current = this.players.get(socket.id);
      if (!parsed.success || !current) return;
      const now = Date.now();
      if (now - current.lastScoreAt < 120) return;
      current.lastScoreAt = now;
      current.state.score = Math.min(
        1_000_000,
        current.state.score + parsed.data.points,
      );
    });

    socket.on("power:use", (rawEvent) => {
      const parsed = PowerUseSchema.safeParse(rawEvent);
      if (!parsed.success || !this.players.has(socket.id)) return;
      const now = Date.now();
      if (now - (this.lastPowerAt.get(socket.id) ?? 0) < 250) return;
      this.lastPowerAt.set(socket.id, now);
      this.broadcastExcept(socket.id, "power:spawn", {
        ...parsed.data,
        sourceId: socket.id,
      });
    });

    socket.on("exploration:collect", (boltIndex) => {
      if (
        this.mode !== "exploration" ||
        !Number.isInteger(boltIndex) ||
        boltIndex < 0 ||
        boltIndex >= 24
      ) {
        return;
      }
      this.collectedBolts.add(boltIndex);
    });

    socket.on("room:leave", () => this.remove(socket.id));
    socket.once("disconnect", () => this.remove(socket.id));

    if (this.mode === "race" && this.phase === "waiting") {
      this.phase = "countdown";
      this.countdownEndsAt = Date.now() + 4_000;
    }

    const snapshot = this.snapshot();
    this.broadcastExcept(socket.id, "player:joined", player.state);
    return {
      ok: true,
      playerId: socket.id,
      roomId: this.id,
      snapshot,
    };
  }

  remove(playerId: string) {
    if (!this.players.has(playerId)) return;
    this.players.delete(playerId);
    this.lastPowerAt.delete(playerId);
    const socket = this.sockets.get(playerId);
    socket?.leave(this.id);
    this.sockets.delete(playerId);
    this.broadcast("player:left", playerId);
    if (this.empty) {
      this.phase = "waiting";
      this.countdownEndsAt = null;
      this.raceStartedAt = null;
      this.collectedBolts.clear();
    }
  }

  update(delta: number) {
    this.serverTick += 1;
    for (const player of this.players.values()) {
      simulatePlayer(player, delta);
    }

    const now = Date.now();
    if (
      this.phase === "countdown" &&
      this.countdownEndsAt &&
      now >= this.countdownEndsAt
    ) {
      this.phase = "racing";
      this.raceStartedAt = now;
      this.countdownEndsAt = null;
      this.broadcast("room:notice", "GO!");
    }
    if (
      this.phase === "racing" &&
      this.raceStartedAt &&
      now - this.raceStartedAt > 180_000
    ) {
      this.phase = "results";
    }

    if (this.serverTick % 2 === 0) {
      this.broadcast("room:snapshot", this.snapshot());
    }
  }

  snapshot(): RoomSnapshot {
    return {
      protocol: PROTOCOL_VERSION,
      roomId: this.id,
      serverTick: this.serverTick,
      serverTime: Date.now(),
      mode: this.mode,
      phase: this.phase,
      countdownEndsAt: this.countdownEndsAt,
      raceStartedAt: this.raceStartedAt,
      players: [...this.players.values()].map((player) => ({ ...player.state })),
      collectedBolts: [...this.collectedBolts],
    };
  }

  private broadcast<Event extends keyof ServerToClientEvents>(
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ) {
    for (const socket of this.sockets.values()) {
      socket.emit(event, ...args);
    }
  }

  private broadcastExcept<Event extends keyof ServerToClientEvents>(
    excludedId: string,
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ) {
    for (const [id, socket] of this.sockets) {
      if (id !== excludedId) socket.emit(event, ...args);
    }
  }
}
