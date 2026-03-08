import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";

// Message type definitions
interface PingMessage {
  type: "PING";
}

interface PongMessage {
  type: "PONG";
}

interface StateSnapshotMessage {
  type: "STATE_SNAPSHOT";
  payload: Record<string, unknown>;
  engineSignals?: Record<string, unknown>;
  ts: number;
}

interface ControlMessage {
  type: "CONTROL";
  action: string;
  payload?: unknown;
}

type ExtensionMessage = PingMessage | StateSnapshotMessage;
type MobileMessage = ControlMessage;
type InboundMessage = ExtensionMessage | MobileMessage;

export async function draftLiveRoutes(app: FastifyInstance) {
  let extensionSocket: WebSocket | null = null;
  const mobileClients = new Set<WebSocket>();
  let latestSnapshot: string | null = null;

  app.get("/draft/live", { websocket: true }, (socket, req) => {
    const params = new URLSearchParams(req.url.split("?")[1] ?? "");
    const role = params.get("role");

    if (role === "extension") {
      extensionSocket = socket;
      app.log.info("[DraftLive] Extension connected");

      socket.on("message", (raw: Buffer) => {
        let msg: InboundMessage;
        try {
          msg = JSON.parse(raw.toString()) as InboundMessage;
        } catch {
          app.log.warn("[DraftLive] Extension sent malformed message — ignoring");
          return;
        }

        if (msg.type === "PING") {
          socket.send(JSON.stringify({ type: "PONG" } satisfies PongMessage));
          return;
        }

        // Cache the snapshot and fan out to all mobile clients
        const str = raw.toString();
        latestSnapshot = str;

        for (const client of mobileClients) {
          if (client.readyState === 1) {
            client.send(str);
          }
        }
      });

      socket.on("close", () => {
        extensionSocket = null;
        app.log.info("[DraftLive] Extension disconnected");
      });

      socket.on("error", (err: Error) => {
        app.log.error({ err }, "[DraftLive] Extension socket error");
        extensionSocket = null;
      });
    } else {
      // Treat all non-extension connections as mobile clients
      mobileClients.add(socket);
      app.log.info(
        `[DraftLive] Mobile client connected (total: ${mobileClients.size})`,
      );

      // Send the latest snapshot immediately so the phone gets current state
      if (latestSnapshot !== null) {
        socket.send(latestSnapshot);
      }

      socket.on("message", (raw: Buffer) => {
        let msg: InboundMessage;
        try {
          msg = JSON.parse(raw.toString()) as InboundMessage;
        } catch {
          app.log.warn("[DraftLive] Mobile client sent malformed message — ignoring");
          return;
        }

        if (msg.type === "CONTROL" && extensionSocket?.readyState === 1) {
          extensionSocket.send(raw.toString());
        }
      });

      socket.on("close", () => {
        mobileClients.delete(socket);
        app.log.info(
          `[DraftLive] Mobile client disconnected (total: ${mobileClients.size})`,
        );
      });

      socket.on("error", (err: Error) => {
        app.log.error({ err }, "[DraftLive] Mobile socket error");
        mobileClients.delete(socket);
      });
    }
  });
}
