import type { ChatMessage, SongSpec } from "./types";

export function newChatMessage(
  role: ChatMessage["role"],
  content: string,
  spec: SongSpec | null = null,
): ChatMessage {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `msg_${crypto.randomUUID()}`
      : `msg_${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    role,
    content,
    spec,
    created_at: new Date().toISOString(),
  };
}
