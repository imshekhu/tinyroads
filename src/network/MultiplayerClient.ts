import { io, type Socket } from "socket.io-client";
import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type JoinRequest,
  type JoinResult,
  type NetworkDriveInput,
  type RoomSnapshot,
  type ScoreEvent,
  type ServerToClientEvents,
} from "../../shared/protocol";
import type { DriveInput } from "../input/Controls";

type ConnectionState = "offline" | "connecting" | "connected" | "error";

export class MultiplayerClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private sequence = 0;
  private lastInputSentAt = 0;
  private joinRequest: JoinRequest | null = null;

  state: ConnectionState = "offline";
  localPlayerId: string | null = null;
  roomId: string | null = null;
  latestSnapshot: RoomSnapshot | null = null;
  onSnapshot: ((snapshot: RoomSnapshot) => void) | null = null;
  onNotice: ((message: string) => void) | null = null;
  onStateChange: ((state: ConnectionState) => void) | null = null;

  private serverUrl() {
    const configured = import.meta.env.VITE_MULTIPLAYER_URL as string | undefined;
    if (configured) return configured;
    if (
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      /^(10\.|192\.168\.|100\.)/.test(location.hostname)
    ) {
      return `http://${location.hostname}:3001`;
    }
    return "";
  }

  async connect(name: string, color: number): Promise<JoinResult> {
    const url = this.serverUrl();
    if (!url) {
      this.setState("error");
      return { ok: false, reason: "invalid-request" };
    }
    this.joinRequest = {
      protocol: PROTOCOL_VERSION,
      name,
      color,
      mode: "race",
    };
    this.setState("connecting");
    this.socket = io(url, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnectionAttempts: 8,
      reconnectionDelay: 800,
      timeout: 5_000,
    }) as Socket<ServerToClientEvents, ClientToServerEvents>;

    this.socket.on("room:snapshot", (snapshot) => {
      if (snapshot.protocol !== PROTOCOL_VERSION) return;
      this.latestSnapshot = snapshot;
      this.onSnapshot?.(snapshot);
    });
    this.socket.on("room:notice", (message) => this.onNotice?.(message));
    this.socket.on("disconnect", () => this.setState("connecting"));
    this.socket.on("connect_error", () => this.setState("error"));
    this.socket.on("connect", () => {
      if (this.joinRequest && this.localPlayerId) {
        this.join(this.joinRequest).then((result) => {
          if (result.ok) this.acceptJoin(result);
        });
      }
    });
    this.socket.connect();

    try {
      await this.waitForConnection();
      const result = await this.join(this.joinRequest);
      if (result.ok) this.acceptJoin(result);
      else this.setState("error");
      return result;
    } catch {
      this.setState("error");
      return { ok: false, reason: "invalid-request" };
    }
  }

  private waitForConnection() {
    return new Promise<void>((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }
      const timer = window.setTimeout(
        () => reject(new Error("Connection timed out")),
        6_000,
      );
      this.socket?.once("connect", () => {
        window.clearTimeout(timer);
        resolve();
      });
    });
  }

  private join(request: JoinRequest) {
    return new Promise<JoinResult>((resolve) => {
      const timer = window.setTimeout(
        () => resolve({ ok: false, reason: "invalid-request" }),
        5_000,
      );
      this.socket!.emit("room:join", request, (result) => {
        window.clearTimeout(timer);
        resolve(result);
      });
    });
  }

  private acceptJoin(result: Extract<JoinResult, { ok: true }>) {
    this.localPlayerId = result.playerId;
    this.roomId = result.roomId;
    this.latestSnapshot = result.snapshot;
    this.onSnapshot?.(result.snapshot);
    this.setState("connected");
  }

  sendInput(input: DriveInput) {
    if (!this.socket?.connected || this.state !== "connected") return;
    const now = performance.now();
    if (now - this.lastInputSentAt < 50) return;
    this.lastInputSentAt = now;
    const payload: NetworkDriveInput = {
      sequence: ++this.sequence,
      throttle: input.throttle,
      brake: input.brake,
      steering: input.steering,
      handbrake: input.handbrake,
      boost: input.boost,
      clientTime: now,
    };
    this.socket.emit("player:input", payload);
  }

  sendScore(event: ScoreEvent) {
    if (this.socket?.connected) this.socket.emit("score:event", event);
  }

  disconnect() {
    this.socket?.emit("room:leave");
    this.socket?.disconnect();
    this.socket = null;
    this.localPlayerId = null;
    this.roomId = null;
    this.latestSnapshot = null;
    this.joinRequest = null;
    this.setState("offline");
  }

  private setState(state: ConnectionState) {
    if (this.state === state) return;
    this.state = state;
    this.onStateChange?.(state);
  }
}
