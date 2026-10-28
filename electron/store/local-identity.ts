import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface StoredLocalIdentity {
  peerId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidPeerId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Returns the device identity used by discovery and chat persistence.
 *
 * This is intentionally stored separately from chat history: clearing a chat
 * must not make the same Mac appear as a new user on every launch.
 */
export function loadOrCreateLocalPeerId(identityPath: string): string {
  try {
    const raw = fs.readFileSync(identityPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && isValidPeerId((parsed as StoredLocalIdentity).peerId)) {
      return (parsed as StoredLocalIdentity).peerId;
    }
  } catch {
    // Missing or malformed identity files are repaired below.
  }

  const peerId = crypto.randomUUID();
  const directory = path.dirname(identityPath);
  const temporaryPath = `${identityPath}.${process.pid}.${Date.now()}.tmp`;

  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify({ peerId }, null, 2), 'utf8');
    fs.renameSync(temporaryPath, identityPath);
  } catch (error) {
    try {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    } catch {
      // Best effort cleanup only.
    }
    console.warn(`[Subnet:Identity] Could not persist local identity: ${(error as Error).message}`);
  }

  return peerId;
}
