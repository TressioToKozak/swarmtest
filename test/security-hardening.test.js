'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const WebSocket = require('ws');
const { GameServer, createHttpServer } = require('../server');
const { originAllowed, requestIp } = require('../network-security');

function listen(runtime) {
  return new Promise((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
}
function open(url, options) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}
function rejected(url, options) {
  return new Promise((resolve) => {
    const socket = new WebSocket(url, options);
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode);
    });
    socket.once('error', () => resolve(0));
  });
}
function message(socket, type) {
  return new Promise((resolve) => {
    const listener = (raw) => {
      const parsed = JSON.parse(raw);
      if (parsed.type === type) {
        socket.off('message', listener);
        resolve(parsed);
      }
    };
    socket.on('message', listener);
  });
}

function runtimeFixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-security-'));
  const runtime = createHttpServer(new GameServer(), {
    accountFile: path.join(directory, 'accounts.json'),
    ...options,
  });
  t.after(() => new Promise((resolve) => runtime.server.close(resolve)));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return runtime;
}

test('Origin policy allows local development and configured production origins', () => {
  const request = (origin) => ({ headers: { origin }, socket: { remoteAddress: '127.0.0.1' } });
  assert.equal(originAllowed(request('http://localhost:8080')), true);
  assert.equal(originAllowed(request('https://game.example'), 'https://game.example'), true);
  assert.equal(originAllowed(request('https://evil.example'), 'https://game.example'), false);
});

test('client IP ignores forwarded headers unless trusted proxy mode is explicit', () => {
  const request = {
    headers: { 'x-forwarded-for': '203.0.113.9' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(requestIp(request, false), '127.0.0.1');
  assert.equal(requestIp(request, true), '203.0.113.9');
});

test('WebSocket rejects disallowed origins and excess active connections predictably', async (t) => {
  const runtime = runtimeFixture(t, {
    wsLimits: { maxConnectionsPerIp: 1 },
    allowedOrigins: 'https://game.example',
  });
  await listen(runtime);
  const url = `ws://127.0.0.1:${runtime.server.address().port}`;
  assert.equal(await rejected(url, { origin: 'https://evil.example' }), 403);
  const first = await open(url, { origin: 'https://game.example' });
  assert.equal(await rejected(url, { origin: 'https://game.example' }), 429);
  const closed = new Promise((resolve) => first.once('close', resolve));
  first.terminate();
  await closed;
});

test('create-lobby limiter survives reconnects from the same IP', async (t) => {
  const runtime = runtimeFixture(t, {
    wsLimits: { createLobbyLimit: 1, createLobbyWindowMs: 60_000 },
  });
  await listen(runtime);
  const socket = await open(`ws://127.0.0.1:${runtime.server.address().port}`);
  socket.send(
    JSON.stringify({ type: 'hello', installationId: 'rate-test', unlocked: [], maps: [] }),
  );
  await message(socket, 'helloAck');
  socket.send(JSON.stringify({ type: 'createLobby' }));
  await message(socket, 'lobbyState');
  const closed = new Promise((resolve) => socket.once('close', resolve));
  socket.send(JSON.stringify({ type: 'createLobby' }));
  assert.equal(await closed, 1013);
  assert.equal(runtime.core.lobbies.size, 1);
});

test('upgrade offers and lobby codes are deterministic with injected randomness', () => {
  const sequence = [0.1, 0.8, 0.3, 0.6, 0.2, 0.9];
  const make = () => {
    let index = 0;
    return new GameServer(
      () => 1_000,
      () => sequence[index++ % sequence.length],
    );
  };
  const player = { items: {}, augments: [] };
  assert.deepEqual(make().offer(player), make().offer(player));
  assert.equal(make().code(), make().code());
});
