import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { loadOrCreateLocalPeerId } from '../local-identity';

test('local peer identity remains stable across launches', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'subnet-identity-'));
  const identityPath = path.join(directory, 'identity.json');

  try {
    const first = loadOrCreateLocalPeerId(identityPath);
    const second = loadOrCreateLocalPeerId(identityPath);

    assert.match(first, /^[0-9a-f-]{36}$/i);
    assert.equal(second, first);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('corrupt local identity is replaced with a valid identity', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'subnet-identity-'));
  const identityPath = path.join(directory, 'identity.json');

  try {
    fs.writeFileSync(identityPath, '{not-json', 'utf8');
    const peerId = loadOrCreateLocalPeerId(identityPath);
    assert.match(peerId, /^[0-9a-f-]{36}$/i);
    assert.equal(JSON.parse(fs.readFileSync(identityPath, 'utf8')).peerId, peerId);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
