import { describe, it, expect } from "vitest";
import { decodeClient, encodeServer } from "@/lib/ws/protocol";

describe("WS protocol", () => {
  it("decodes a valid user_msg with session_id", () => {
    const result = decodeClient({ type: "user_msg", session_id: "abc", content: "hello" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("user_msg");
  });

  it("decodes a valid user_msg without session_id (new chat)", () => {
    const result = decodeClient({ type: "user_msg", content: "hi" });
    expect(result.success).toBe(true);
  });

  it("decodes new_chat with no fields", () => {
    const result = decodeClient({ type: "new_chat" });
    expect(result.success).toBe(true);
  });

  it("decodes subscribe with session_id", () => {
    const result = decodeClient({ type: "subscribe", session_id: "abc" });
    expect(result.success).toBe(true);
  });

  it("decodes cancel with session_id", () => {
    const result = decodeClient({ type: "cancel", session_id: "abc" });
    expect(result.success).toBe(true);
  });

  it("rejects unknown envelope type", () => {
    const result = decodeClient({ type: "bogus" });
    expect(result.success).toBe(false);
  });

  it("rejects user_msg with empty content", () => {
    const result = decodeClient({ type: "user_msg", content: "" });
    expect(result.success).toBe(false);
  });

  it("rejects user_msg missing content entirely", () => {
    const result = decodeClient({ type: "user_msg", session_id: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects subscribe missing session_id", () => {
    const result = decodeClient({ type: "subscribe" });
    expect(result.success).toBe(false);
  });

  it("does not accept the removed permission_response envelope", () => {
    const result = decodeClient({ type: "permission_response", session_id: "x", id: "y", allow: true });
    expect(result.success).toBe(false);
  });

  it("encodes server envelopes as JSON strings", () => {
    const s = encodeServer({ type: "text_delta", session_id: "x", content: "hi" });
    expect(JSON.parse(s)).toEqual({ type: "text_delta", session_id: "x", content: "hi" });
  });

  it("encodes session_started", () => {
    const s = encodeServer({ type: "session_started", session_id: "abc" });
    expect(JSON.parse(s)).toEqual({ type: "session_started", session_id: "abc" });
  });

  it("encodes tool_use_result with optional error", () => {
    const s = encodeServer({
      type: "tool_use_result",
      session_id: "x",
      id: "t1",
      result: "ok",
      error: "permission_denied",
    });
    expect(JSON.parse(s)).toMatchObject({ type: "tool_use_result", error: "permission_denied" });
  });

  it("encodes result envelope with permission_denials", () => {
    const s = encodeServer({
      type: "result",
      session_id: "x",
      permission_denials: [{ tool_name: "Bash", tool_use_id: "t1", tool_input: { command: "rm" } }],
    });
    const parsed = JSON.parse(s);
    expect(parsed.permission_denials).toHaveLength(1);
  });

  it("encodes error envelope", () => {
    const s = encodeServer({ type: "error", reason: "invalid_envelope", detail: "bad shape" });
    expect(JSON.parse(s)).toMatchObject({ type: "error", reason: "invalid_envelope" });
  });
});
