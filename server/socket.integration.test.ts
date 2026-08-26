import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import {
  io as createClient,
  type Socket as ClientSocket,
} from "socket.io-client";
import request from "supertest";
import { authenticateSocket, sign } from "./auth.js";
import { authRouter } from "./authRoutes.js";
import { db, reset } from "./db.js";
import { bindSocketRevocations, registerSocketHandlers } from "./realtime.js";
import { createCorsOptions, requestOriginAllowed } from "./security.js";

beforeEach(() => {
  process.env.TEST_MODE = "true";
  reset();
});

const event = <T>(socket: ClientSocket, name: string, timeout = 3_000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${name}`)),
      timeout,
    );
    socket.once(name, (value: T) => {
      clearTimeout(timer);
      resolve(value);
    });
  });

const currentToken = (userId: number, expires = "15m") => {
  const user = db
    .prepare("SELECT id,email,name,role,session_version FROM users WHERE id=?")
    .get(userId) as any;
  return sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionVersion: Number(user.session_version),
    },
    expires,
  );
};

const startRealtimeServer = async () => {
  const allowedOrigins = new Set(["https://allowed.test"]),
    app = express(),
    httpServer = createServer(app),
    io = new Server(httpServer, {
      cors: createCorsOptions(allowedOrigins),
      allowRequest(req, callback) {
        callback(
          null,
          requestOriginAllowed(req.headers.origin, allowedOrigins),
        );
      },
    });
  app.use(express.json());
  app.use("/api/auth", authRouter);
  io.use(authenticateSocket);
  const unbind = bindSocketRevocations(io);
  registerSocketHandlers(io);
  let probeCount = 0;
  io.on("connection", (socket) =>
    socket.on("probe", (ack?: () => void) => {
      probeCount += 1;
      ack?.();
    }),
  );
  await new Promise<void>((resolve) =>
    httpServer.listen(0, "127.0.0.1", resolve),
  );
  const port = (httpServer.address() as AddressInfo).port,
    clients: ClientSocket[] = [];
  return {
    app,
    url: `http://127.0.0.1:${port}`,
    client(options: Parameters<typeof createClient>[1]) {
      const socket = createClient(`http://127.0.0.1:${port}`, {
        forceNew: true,
        reconnection: false,
        timeout: 1_500,
        ...options,
      });
      clients.push(socket);
      return socket;
    },
    probeCount: () => probeCount,
    async close() {
      for (const client of clients) client.close();
      unbind();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening)
        await new Promise<void>((resolve, reject) =>
          httpServer.close((error) => (error ? reject(error) : resolve())),
        );
    },
  };
};

test("direct WebSocket transport rejects hostile origins and permits allowed/native clients", async () => {
  const server = await startRealtimeServer();
  try {
    const hostile = server.client({
      transports: ["websocket"],
      auth: { token: currentToken(2) },
      extraHeaders: { Origin: "https://hostile.test" },
    });
    await event(hostile, "connect_error");
    assert.equal(hostile.connected, false);

    const allowed = server.client({
      transports: ["websocket"],
      auth: { token: currentToken(2) },
      extraHeaders: { Origin: "https://allowed.test" },
    });
    await event(allowed, "connect");
    assert.equal(allowed.connected, true);

    const native = server.client({
      transports: ["websocket"],
      auth: { token: currentToken(2) },
    });
    await event(native, "connect");
    assert.equal(native.connected, true);
  } finally {
    await server.close();
  }
});

test("socket events revalidate session versions and invalid sockets disconnect", async () => {
  const server = await startRealtimeServer();
  try {
    const client = server.client({
      transports: ["websocket"],
      auth: { token: currentToken(2) },
    });
    await event(client, "connect");
    db.prepare(
      "UPDATE users SET session_version=session_version+1 WHERE id=2",
    ).run();
    const disconnected = event(client, "disconnect");
    client.emit("probe");
    await disconnected;
    assert.equal(server.probeCount(), 0);
  } finally {
    await server.close();
  }
});

test("socket lifetime is bounded by JWT expiry", async () => {
  const server = await startRealtimeServer();
  try {
    const client = server.client({
      transports: ["websocket"],
      auth: { token: currentToken(2, "2s") },
    });
    await event(client, "connect");
    await event(client, "disconnect", 4_000);
    assert.equal(client.connected, false);
  } finally {
    await server.close();
  }
});

test("logout disconnects the authenticated user's live sockets", async () => {
  const server = await startRealtimeServer();
  try {
    const token = currentToken(2),
      client = server.client({
        transports: ["websocket"],
        auth: { token },
      });
    await event(client, "connect");
    const disconnected = event(client, "disconnect");
    await request(server.app)
      .post("/api/auth/logout")
      .set("authorization", `Bearer ${token}`)
      .send({})
      .expect(200);
    await disconnected;
  } finally {
    await server.close();
  }
});

test("viewer sockets cannot publish chat or counter mutations", async () => {
  const server = await startRealtimeServer();
  try {
    const viewer = server.client({
      transports: ["websocket"],
      auth: { token: currentToken(3) },
    });
    await event(viewer, "connect");
    const chatError = event<{ code: string }>(viewer, "operation-error");
    viewer.emit("chat", { text: "blocked" });
    assert.equal((await chatError).code, "READ_ONLY_ROLE");
    const counterError = event<{ code: string }>(viewer, "operation-error");
    viewer.emit("counter");
    assert.equal((await counterError).code, "READ_ONLY_ROLE");
  } finally {
    await server.close();
  }
});
