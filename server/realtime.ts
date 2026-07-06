export const REALTIME_EVENT = "gamevault:realtime-event";

export interface RealtimeEventEnvelope {
  gameId: string;
  event: string;
  payload: unknown;
}

export interface RealtimeEmitter {
  to(room: string): {
    emit(event: string, payload: RealtimeEventEnvelope): void;
  };
}

export function emitRealtimeEvent(
  io: RealtimeEmitter | undefined,
  room: string,
  envelope: RealtimeEventEnvelope,
): boolean {
  if (!room.trim()) {
    throw new Error("realtime room is required");
  }

  io?.to(room).emit(REALTIME_EVENT, envelope);
  return true;
}
