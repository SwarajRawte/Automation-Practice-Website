import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Socket } from "socket.io";
import { authenticateSocket, sign } from "./auth.js";
import { db, reset } from "./db.js";

beforeEach(() => reset());

const tokenForUser = () =>
  sign({
    id: 2,
    email: "user@testlab.local",
    name: "Standard User",
    role: "USER",
    sessionVersion: 0,
  });

const fakeSocket = (token?: string, cookie?: string) => {
  let joinedRoom: string | undefined;
  const socket = {
    handshake: { auth: token ? { token } : {}, headers: { cookie } },
    data: {},
    join(room: string) {
      joinedRoom = room;
    },
  } as unknown as Socket;
  return { socket, joinedRoom: () => joinedRoom };
};

test("socket authentication rejects missing credentials", () => {
  const { socket } = fakeSocket();
  let failure: Error | undefined;
  authenticateSocket(socket, (error) => {
    failure = error;
  });
  assert.equal(failure?.message, "Authentication required");
  assert.deepEqual((failure as Error & { data?: unknown }).data, {
    code: "AUTH_REQUIRED",
  });
});

test("socket authentication accepts current tokens and joins a user room", () => {
  const { socket, joinedRoom } = fakeSocket(tokenForUser());
  let failure: Error | undefined;
  authenticateSocket(socket, (error) => {
    failure = error;
  });
  assert.equal(failure, undefined);
  assert.equal((socket.data.user as { id: number }).id, 2);
  assert.equal(joinedRoom(), "user:2");
});

test("socket authentication supports cookies and rejects revoked sessions", () => {
  const token = tokenForUser(),
    first = fakeSocket(undefined, `access_token=${encodeURIComponent(token)}`);
  let firstFailure: Error | undefined;
  authenticateSocket(first.socket, (error) => {
    firstFailure = error;
  });
  assert.equal(firstFailure, undefined);

  db.prepare(
    "UPDATE users SET session_version=session_version+1 WHERE id=2",
  ).run();
  const revoked = fakeSocket(token);
  let revokedFailure: Error | undefined;
  authenticateSocket(revoked.socket, (error) => {
    revokedFailure = error;
  });
  assert.equal(revokedFailure?.message, "Authentication required");
});
