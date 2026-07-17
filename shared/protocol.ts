import { z } from "zod";

export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS_PER_ROOM = 12;

const finite = z.number().finite();
const unitComponent = finite.min(-1.001).max(1.001);
export const VectorSchema = z.tuple([
  unitComponent,
  unitComponent,
  unitComponent,
]);

export const JoinRequestSchema = z.object({
  protocol: z.literal(PROTOCOL_VERSION),
  name: z.string().trim().min(1).max(20),
  color: z.number().int().min(0).max(0xffffff),
  mode: z.enum(["race", "exploration", "freestyle"]),
});

export const DriveInputSchema = z.object({
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  throttle: z.number().min(0).max(1),
  brake: z.number().min(0).max(1),
  steering: z.number().min(-1).max(1),
  handbrake: z.boolean(),
  boost: z.boolean(),
  clientTime: z.number().finite().nonnegative(),
});

export const ScoreEventSchema = z.object({
  kind: z.enum(["drift", "air", "combo"]),
  points: z.number().int().min(1).max(2500),
});

export type NetworkMode = z.infer<typeof JoinRequestSchema>["mode"];
export type JoinRequest = z.infer<typeof JoinRequestSchema>;
export type NetworkDriveInput = z.infer<typeof DriveInputSchema>;
export type ScoreEvent = z.infer<typeof ScoreEventSchema>;

export type NetworkPlayerState = {
  id: string;
  name: string;
  color: number;
  normal: [number, number, number];
  forward: [number, number, number];
  speed: number;
  lastInputSequence: number;
  score: number;
};

export type RoomSnapshot = {
  protocol: typeof PROTOCOL_VERSION;
  roomId: string;
  serverTick: number;
  serverTime: number;
  mode: NetworkMode;
  phase: "waiting" | "countdown" | "racing" | "results";
  countdownEndsAt: number | null;
  raceStartedAt: number | null;
  players: NetworkPlayerState[];
  collectedBolts: number[];
};

export type JoinResult =
  | {
      ok: true;
      playerId: string;
      roomId: string;
      snapshot: RoomSnapshot;
    }
  | {
      ok: false;
      reason: "invalid-request" | "protocol-mismatch" | "room-full";
    };

export interface ClientToServerEvents {
  "room:join": (
    request: JoinRequest,
    acknowledge: (result: JoinResult) => void,
  ) => void;
  "player:input": (input: NetworkDriveInput) => void;
  "score:event": (event: ScoreEvent) => void;
  "exploration:collect": (boltIndex: number) => void;
  "room:leave": () => void;
}

export interface ServerToClientEvents {
  "room:snapshot": (snapshot: RoomSnapshot) => void;
  "room:notice": (message: string) => void;
  "player:joined": (player: NetworkPlayerState) => void;
  "player:left": (playerId: string) => void;
}
