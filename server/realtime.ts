import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import { protectSocketEvents, runRoom, userRoom } from "./auth.js";
import { nowMs, onClockChange } from "./clock.js";
import { currentTestRunId } from "./runContext.js";
import {
  onTestRunDeleted,
  onTestRunInvalidated,
  runInSocketContext,
} from "./testRuns.js";

const revocations = new EventEmitter();
revocations.setMaxListeners(50);

export function disconnectUserSockets(
  userId: number,
  testRunId = currentTestRunId(),
) {
  revocations.emit("user", userId, testRunId);
}

export function disconnectAllSockets(testRunId = currentTestRunId()) {
  revocations.emit("all", testRunId);
}

export function bindSocketRevocations(io: Server) {
  const disconnectUser = (userId: number, testRunId?: string) =>
      io.in(userRoom(userId, testRunId)).disconnectSockets(true),
    disconnectAll = (testRunId?: string) =>
      io.in(runRoom(testRunId)).disconnectSockets(true);
  revocations.on("user", disconnectUser);
  revocations.on("all", disconnectAll);
  const unbindClock = onClockChange((_state, _reason, testRunId) =>
      disconnectAll(testRunId),
    ),
    unbindDeletion = onTestRunDeleted((testRunId) => disconnectAll(testRunId)),
    unbindInvalidation = onTestRunInvalidated((testRunId) =>
      disconnectAll(testRunId),
    );
  return () => {
    unbindClock();
    unbindDeletion();
    unbindInvalidation();
    revocations.off("user", disconnectUser);
    revocations.off("all", disconnectAll);
  };
}

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    runInSocketContext(socket, () => {
      protectSocketEvents(socket);
      socket.emit("status", { online: true, id: socket.id });
    });
    socket.on("chat", (message) => {
      return runInSocketContext(socket, () => {
        if (socket.data.user?.role === "VIEWER")
          return socket.emit("operation-error", { code: "READ_ONLY_ROLE" });
        const text =
          typeof message === "object" && message !== null && "text" in message
            ? String(message.text).slice(0, 2_000)
            : String(message ?? "").slice(0, 2_000);
        return io
          .to(runRoom())
          .emit("chat", { text, id: `msg-${randomUUID()}` });
      });
    });
    socket.on("counter", () =>
      runInSocketContext(socket, () =>
        socket.data.user?.role === "VIEWER"
          ? socket.emit("operation-error", { code: "READ_ONLY_ROLE" })
          : io.to(runRoom()).emit("counter", { value: nowMs() % 1000 }),
      ),
    );
    socket.on("disconnect", () =>
      socket
        .to(runRoom(socket.data.testRunId))
        .emit("presence", { online: false, id: socket.id }),
    );
  });
}
