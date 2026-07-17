import { randomUUID } from "node:crypto";
import type { NetworkMode } from "../shared/protocol";
import { Room } from "./Room";

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private cleanupAccumulator = 0;

  findOrCreate(mode: NetworkMode) {
    for (const room of this.rooms.values()) {
      if (room.mode === mode && !room.full) return room;
    }
    const room = new Room(`${mode}-${randomUUID().slice(0, 8)}`, mode);
    this.rooms.set(room.id, room);
    return room;
  }

  update(delta: number) {
    for (const room of this.rooms.values()) room.update(delta);
    this.cleanupAccumulator += delta;
    if (this.cleanupAccumulator >= 30) {
      this.cleanupAccumulator = 0;
      for (const [id, room] of this.rooms) {
        if (room.empty) this.rooms.delete(id);
      }
    }
  }

  get roomCount() {
    return this.rooms.size;
  }

  get playerCount() {
    let count = 0;
    for (const room of this.rooms.values()) count += room.players.size;
    return count;
  }
}
