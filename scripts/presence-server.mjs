import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Bonjour } from 'bonjour-service';

const port = Number(process.env.PRESENCE_PORT || 8787);
const host = process.env.PRESENCE_HOST || '0.0.0.0';
const ttlMs = 45_000;
const peers = new Map();

const httpServer = http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Subnet presence service is running.\n');
});
const wss = new WebSocketServer({ server: httpServer, maxPayload: 256 * 1024 });
let bonjour;
let publishedService;

function validPort(value) {
  return Number.isInteger(value) && value >= 1024 && value <= 65534;
}

function sanitizeAvatar(avatar) {
  if (!avatar || !['default', 'preset', 'custom'].includes(avatar.avatarType)) return undefined;
  if (typeof avatar.avatarValue !== 'string' || avatar.avatarValue.length > 160000) return undefined;
  return { avatarType: avatar.avatarType, avatarValue: avatar.avatarValue };
}

function normalizeRegistration(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.type !== 'presence_register' && value.type !== 'presence_heartbeat') return null;
  if (typeof value.peerId !== 'string' || !value.peerId.trim() || value.peerId.length > 128) return null;
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 160) return null;
  return {
    peerId: value.peerId.trim(),
    name: value.name.trim().slice(0, 160),
    avatar: sanitizeAvatar(value.avatar),
    host: typeof value.host === 'string' && value.host.length <= 64 ? value.host : undefined,
    port: validPort(value.port) ? value.port : undefined,
    filePort: validPort(value.filePort) ? value.filePort : undefined,
    scopeToken: typeof value.scopeToken === 'string' && /^[a-f0-9]{8,64}$/.test(value.scopeToken)
      ? value.scopeToken
      : undefined,
    updatedAt: Date.now(),
  };
}

function isSameScope(record, viewer) {
  return Boolean(record.scopeToken && viewer.scopeToken && record.scopeToken === viewer.scopeToken);
}

function publicPeer(record, viewer) {
  const sameScope = isSameScope(record, viewer);
  return {
    peerId: record.peerId,
    name: record.name,
    avatar: record.avatar,
    // Direct LAN candidates are disclosed only to users with the same
    // short-lived network-scope hash. The radar still lists everyone online.
    ...(sameScope && record.host && record.port
      ? { host: record.host, port: record.port, filePort: record.filePort }
      : {}),
    updatedAt: record.updatedAt,
  };
}

function send(socket, message) {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
}

function broadcastToScope(scopeRecord, messageFactory, exceptPeerId) {
  for (const record of peers.values()) {
    if (record.peerId === exceptPeerId) continue;
    if (!isSameScope(record, scopeRecord)) continue;
    send(record.socket, messageFactory(record));
  }
}

function sendSnapshot(record) {
  const list = [];
  for (const candidate of peers.values()) {
    if (candidate.peerId === record.peerId) continue;
    if (!isSameScope(candidate, record)) continue;
    list.push(publicPeer(candidate, record));
  }
  send(record.socket, { type: 'presence_snapshot', peers: list });
}

function removeRecord(peerId, socket) {
  const current = peers.get(peerId);
  if (!current || (socket && current.socket !== socket)) return;
  peers.delete(peerId);
  broadcastToScope(current, () => ({ type: 'presence_remove', peerId }), peerId);
}

wss.on('connection', (socket) => {
  let registeredPeerId = null;

  socket.on('message', (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      send(socket, { type: 'presence_error', message: 'Invalid JSON payload' });
      return;
    }

    if (parsed?.type === 'presence_leave') {
      if (typeof parsed.peerId === 'string') removeRecord(parsed.peerId, socket);
      return;
    }

    const next = normalizeRegistration(parsed);
    if (!next) {
      send(socket, { type: 'presence_error', message: 'Invalid presence registration' });
      return;
    }

    const previous = peers.get(next.peerId);
    const isHeartbeat = parsed?.type === 'presence_heartbeat';
    if (previous && previous.socket !== socket) {
      // A second session replaces the stale session for the same persistent
      // identity. This avoids duplicate radar entries after reconnects.
      try { previous.socket.close(4001, 'Replaced by a newer session'); } catch { /* noop */ }
    }

    // If an existing session moved to a different LAN scope, remove its old
    // radar entry from the previous scope before publishing the new one.
    if (previous?.socket === socket && !isSameScope(previous, next)) {
      broadcastToScope(previous, () => ({ type: 'presence_remove', peerId: next.peerId }), next.peerId);
    }

    const record = { ...next, socket };
    peers.set(next.peerId, record);
    registeredPeerId = next.peerId;
    // Heartbeats refresh the in-memory TTL only. Registration or an endpoint
    // change is what needs to update every radar; this keeps a busy server from
    // re-sending the same peer list every 15 seconds.
    if (isHeartbeat && previous?.socket === socket) return;
    sendSnapshot(record);
    broadcastToScope(record, (viewer) => ({
      type: 'presence_upsert',
      peer: publicPeer(record, viewer),
    }), next.peerId);
  });

  socket.on('close', () => {
    if (registeredPeerId) removeRecord(registeredPeerId, socket);
  });
  socket.on('error', () => {
    if (registeredPeerId) removeRecord(registeredPeerId, socket);
  });
});

setInterval(() => {
  const cutoff = Date.now() - ttlMs;
  for (const record of peers.values()) {
    if (record.updatedAt < cutoff) removeRecord(record.peerId, record.socket);
  }
}, 10_000).unref();

httpServer.listen(port, host, () => {
  console.log(`Subnet presence service listening on ws://${host}:${port}`);
  console.log('Presence is ephemeral: no chat messages, files, or history are stored.');
  try {
    bonjour = new Bonjour();
    publishedService = bonjour.publish({
      name: `Subnet Presence-${port}`,
      type: 'subnet-presence',
      protocol: 'tcp',
      port,
    });
    console.log(`Advertising presence service as _subnet-presence._tcp on port ${port}`);
  } catch (error) {
    console.warn(`Could not advertise presence service over Bonjour: ${error.message || error}`);
  }
});

function shutdown() {
  try { publishedService?.stop(); } catch { /* noop */ }
  try { bonjour?.destroy(); } catch { /* noop */ }
  for (const record of peers.values()) {
    try { record.socket.close(1001, 'Presence service shutting down'); } catch { /* noop */ }
  }
  wss.close();
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
