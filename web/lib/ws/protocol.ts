import { z } from "zod";

// ---------------- Client → Server ----------------

export const ClientEnvelope = z.discriminatedUnion("type", [
  z.object({ type: z.literal("new_chat") }),
  z.object({ type: z.literal("subscribe"), session_id: z.string() }),
  z.object({
    type: z.literal("user_msg"),
    session_id: z.string().optional(),
    content: z.string().min(1),
  }),
  z.object({ type: z.literal("cancel"), session_id: z.string() }),
]);
export type ClientEnvelope = z.infer<typeof ClientEnvelope>;

// ---------------- Server → Client ----------------

export const PermissionDenial = z.object({
  tool_name: z.string(),
  tool_use_id: z.string(),
  tool_input: z.unknown(),
});

export const ServerEnvelope = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session_started"), session_id: z.string() }),
  z.object({ type: z.literal("subscribed"), session_id: z.string() }),
  z.object({ type: z.literal("replay_user_msg"), session_id: z.string(), content: z.string() }),
  z.object({ type: z.literal("replay_done"), session_id: z.string() }),
  z.object({ type: z.literal("text_delta"), session_id: z.string(), content: z.string() }),
  z.object({
    type: z.literal("tool_use_start"),
    session_id: z.string(),
    id: z.string(),
    name: z.string(),
    args: z.unknown(),
  }),
  z.object({
    type: z.literal("tool_use_result"),
    session_id: z.string(),
    id: z.string(),
    result: z.unknown(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal("result"),
    session_id: z.string(),
    permission_denials: z.array(PermissionDenial).default([]),
  }),
  z.object({
    type: z.literal("error"),
    session_id: z.string().optional(),
    reason: z.string(),
    detail: z.string().optional(),
  }),
]);
export type ServerEnvelope = z.infer<typeof ServerEnvelope>;

// ---------------- Codec helpers ----------------

export function decodeClient(data: unknown) {
  return ClientEnvelope.safeParse(data);
}

export function encodeServer(envelope: ServerEnvelope): string {
  return JSON.stringify(envelope);
}
