import type Database from "better-sqlite3";
import { EventEmitter } from "node:events";
import { ClaudeBridge, type BridgeOpts } from "@/lib/claude/bridge";
import type { ClaudeEvent } from "@/lib/claude/types";
import {
  upsertSession,
  getSession,
  setSessionTitle,
  touchSession,
} from "@/lib/sessions/index";

export type ManagerOpts = {
  db: Database.Database;
  bridgeOpts: Omit<BridgeOpts, "resumeId">;
};

type ManagerEventMap = {
  event: [sessionId: string, e: ClaudeEvent];
  exit: [sessionId: string, info: { code: number | null; signal: NodeJS.Signals | null }];
  error: [sessionId: string, err: Error];
};

type InFlight = {
  bridge: ClaudeBridge;
  // session_id may not be known until system_init arrives. Tracked separately.
  knownSessionId: string;
  // The current key under which this flight is registered in inFlight. Mutated
  // when we promote a temp key to a real session id, so closures held by bridge
  // listeners can still find the flight.
  currentKey: string;
  firstUserMessage: string | null;
};

const TITLE_MAX = 60;

export class SessionManager extends EventEmitter<ManagerEventMap> {
  // Keyed by session_id once known. For new chats, we use a temp key prefix until
  // system_init arrives, then re-key to the real session_id.
  private inFlight = new Map<string, InFlight>();
  private nextTempId = 0;

  constructor(private opts: ManagerOpts) {
    super();
  }

  /**
   * Dispatch a user message. If sessionId is undefined, starts a new chat.
   * Throws if a bridge is already in flight for the given session.
   *
   * For new chats, resolves once the bridge has either received `system_init`
   * (so the manager knows the session_id and has registered it under that key)
   * OR exited before init. This makes it safe for callers to issue subsequent
   * explicit-id dispatches without racing the init handshake.
   *
   * For resumed chats, resolves synchronously after the bridge is spawned.
   */
  async dispatchUserMessage(sessionId: string | undefined, content: string): Promise<void> {
    if (sessionId) {
      if (this.inFlight.has(sessionId)) {
        throw new Error(`session ${sessionId} already has an in-flight generation`);
      }
      this.spawnAndSend(sessionId, sessionId, content, /* isNew */ false);
      return;
    }

    const tempKey = `__pending__${this.nextTempId++}`;
    const flight = this.spawnAndSend(tempKey, undefined, content, /* isNew */ true);

    // Wait for init promotion (or early exit) so a follow-up dispatch with the
    // real session id can detect the in-flight bridge.
    await new Promise<void>((resolve) => {
      const onEventCheck = (e: ClaudeEvent) => {
        if (e.kind === "system_init" && e.session_id) {
          flight.bridge.off("event", onEventCheck);
          flight.bridge.off("exit", onExit);
          resolve();
        }
      };
      const onExit = () => {
        flight.bridge.off("event", onEventCheck);
        resolve();
      };
      flight.bridge.on("event", onEventCheck);
      flight.bridge.once("exit", onExit);
    });
  }

  cancel(sessionId: string): void {
    // Try the real session id first, then any pending temp keys
    const direct = this.inFlight.get(sessionId);
    if (direct) {
      direct.bridge.cancel();
      return;
    }
    for (const flight of this.inFlight.values()) {
      if (flight.knownSessionId === sessionId) flight.bridge.cancel();
    }
  }

  async shutdown(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const flight of this.inFlight.values()) {
      promises.push(flight.bridge.stop());
    }
    await Promise.all(promises);
    this.inFlight.clear();
  }

  private spawnAndSend(key: string, resumeId: string | undefined, content: string, isNew: boolean): InFlight {
    const bridge = new ClaudeBridge({ ...this.opts.bridgeOpts, resumeId });
    const flight: InFlight = {
      bridge,
      knownSessionId: resumeId ?? "",
      currentKey: key,
      firstUserMessage: isNew ? content : null,
    };
    this.inFlight.set(key, flight);

    bridge.on("event", (e) => this.handleEvent(flight, e));
    bridge.on("exit", (info) => this.handleExit(flight, info));
    bridge.on("error", (err) => {
      const sid = flight.knownSessionId || "";
      this.emit("error", sid, err);
    });
    bridge.on("hang_timeout", () => {
      const sid = flight.knownSessionId || "";
      this.emit("error", sid, new Error("hang_timeout"));
    });

    bridge.send(content);
    return flight;
  }

  private handleEvent(flight: InFlight, e: ClaudeEvent): void {
    if (e.kind === "system_init" && e.session_id && flight.knownSessionId === "") {
      // Promote temp key to real session id
      const oldKey = flight.currentKey;
      flight.knownSessionId = e.session_id;
      flight.currentKey = e.session_id;
      this.inFlight.delete(oldKey);
      this.inFlight.set(e.session_id, flight);

      const now = Date.now();
      const title = flight.firstUserMessage
        ? flight.firstUserMessage.slice(0, TITLE_MAX).trim()
        : "";
      upsertSession(this.opts.db, {
        id: e.session_id,
        title,
        created_at: now,
        last_touched_at: now,
      });
    }

    if (e.kind === "result" && flight.knownSessionId) {
      touchSession(this.opts.db, flight.knownSessionId, Date.now());
      const row = getSession(this.opts.db, flight.knownSessionId);
      if (row && !row.title && flight.firstUserMessage) {
        setSessionTitle(
          this.opts.db,
          flight.knownSessionId,
          flight.firstUserMessage.slice(0, TITLE_MAX).trim(),
        );
      }
    }

    this.emit("event", flight.knownSessionId, e);
  }

  private handleExit(
    flight: InFlight,
    info: { code: number | null; signal: NodeJS.Signals | null },
  ): void {
    const sid = flight.knownSessionId || flight.currentKey;
    this.inFlight.delete(flight.currentKey);
    this.emit("exit", sid, info);
  }
}
