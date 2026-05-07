"use client";
import { create } from "zustand";

export type ToolCall = {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
  error?: string;
};

export type Message =
  | { role: "user"; id: string; text: string }
  | {
      role: "assistant";
      id: string;
      text: string;
      tools: ToolCall[];
      done: boolean;
      permissionDenials: Array<{ tool_name: string; tool_use_id: string; tool_input: unknown }>;
    };

type ChatState = {
  sessionId: string | null;
  messages: Message[];
  connected: boolean;
  lastError: string | null;

  setSessionId: (id: string | null) => void;
  setConnected: (b: boolean) => void;
  setError: (msg: string | null) => void;

  appendUser: (text: string) => void;
  startAssistant: () => void;
  appendDelta: (text: string) => void;
  addToolStart: (tc: ToolCall) => void;
  addToolResult: (id: string, result: unknown, error?: string) => void;
  setPermissionDenials: (
    denials: Array<{ tool_name: string; tool_use_id: string; tool_input: unknown }>,
  ) => void;
  finishAssistant: () => void;
  reset: () => void;
};

let _id = 0;
const nid = () => `m${++_id}`;

export const useChatStore = create<ChatState>((set) => ({
  sessionId: null,
  messages: [],
  connected: false,
  lastError: null,

  setSessionId: (id) => set({ sessionId: id }),
  setConnected: (b) => set({ connected: b }),
  setError: (msg) => set({ lastError: msg }),

  appendUser: (text) =>
    set((s) => ({
      messages: [...s.messages, { role: "user", id: nid(), text }],
      lastError: null,
    })),

  startAssistant: () =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          role: "assistant",
          id: nid(),
          text: "",
          tools: [],
          done: false,
          permissionDenials: [],
        },
      ],
    })),

  appendDelta: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant" && !last.done) {
        msgs[msgs.length - 1] = { ...last, text: last.text + text };
      }
      return { messages: msgs };
    }),

  addToolStart: (tc) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, tools: [...last.tools, tc] };
      }
      return { messages: msgs };
    }),

  addToolResult: (id, result, error) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = {
          ...last,
          tools: last.tools.map((t) => (t.id === id ? { ...t, result, error } : t)),
        };
      }
      return { messages: msgs };
    }),

  setPermissionDenials: (denials) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, permissionDenials: denials };
      }
      return { messages: msgs };
    }),

  finishAssistant: () =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") msgs[msgs.length - 1] = { ...last, done: true };
      return { messages: msgs };
    }),

  reset: () => set({ messages: [], sessionId: null, lastError: null }),
}));
