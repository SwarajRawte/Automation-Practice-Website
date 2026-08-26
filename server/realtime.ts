import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import { protectSocketEvents, userRoom } from "./auth.js";

const revocations = new EventEmitter();
revocations.setMaxListeners(50);

export function disconnectUserSockets(userId: number) {
  revocations.emit("user", userId);
}

export function disconnectAllSockets() {
  revocations.emit("all");
}

export function bindSocketRevocations(io: Server) {
  const disconnectUser = (userId: number) =>
      io.in(userRoom(userId)).disconnectSockets(true),
    disconnectAll = () => io.disconnectSockets(true);
  revocations.on("user", disconnectUser);
  revocations.on("all", disconnectAll);
  return () => {
    revocations.off("user", disconnectUser);
    revocations.off("all", disconnectAll);
  };
}

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    protectSocketEvents(socket);
    socket.emit("status", { online: true, id: socket.id });
    socket.on("chat", (message) => {
      if (socket.data.user?.role === "VIEWER")
        return socket.emit("operation-error", { code: "READ_ONLY_ROLE" });
      const text =
        typeof message === "object" && message !== null && "text" in message
          ? String(message.text).slice(0, 2_000)
          : String(message ?? "").slice(0, 2_000);
      return io.emit("chat", { text, id: `msg-${randomUUID()}` });
    });
    socket.on("counter", () =>
      socket.data.user?.role === "VIEWER"
        ? socket.emit("operation-error", { code: "READ_ONLY_ROLE" })
        : io.emit("counter", { value: Date.now() % 1000 }),
    );
    socket.on("disconnect", () =>
      socket.broadcast.emit("presence", { online: false, id: socket.id }),
    );
  });
}
