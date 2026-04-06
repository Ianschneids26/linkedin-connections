import fs from "node:fs";
import path from "node:path";
import type { LinkedInConnection } from "./linkedin.js";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(path.dirname(new URL(import.meta.url).pathname), "..", "data");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredConnection = LinkedInConnection & { seenAt: number };

interface StoreData {
  seenIds: string[];
  connections: StoredConnection[];
}

/** Resolve the store file path for a given client (or the default global store). */
function storePath(clientId?: number): string {
  const filename = clientId
    ? `seen-connections-${clientId}.json`
    : "seen-connections.json";
  return path.join(DATA_DIR, filename);
}

function read(clientId?: number): StoreData {
  const p = storePath(clientId);
  if (!fs.existsSync(p)) {
    return { seenIds: [], connections: [] };
  }
  const raw = fs.readFileSync(p, "utf-8");
  const parsed = JSON.parse(raw);
  return {
    seenIds: parsed.seenIds ?? [],
    connections: parsed.connections ?? [],
  };
}

function write(data: StoreData, clientId?: number): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  // Prune connections older than 7 days
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  data.connections = data.connections.filter((c) => c.seenAt >= cutoff);
  fs.writeFileSync(storePath(clientId), JSON.stringify(data, null, 2));
}

export function filterNewConnections(
  connections: LinkedInConnection[],
  clientId?: number,
): LinkedInConnection[] {
  const store = read(clientId);
  const seenSet = new Set(store.seenIds);
  return connections.filter((c) => !seenSet.has(c.id));
}

export function markAsSeen(
  connections: LinkedInConnection[],
  clientId?: number,
): void {
  const store = read(clientId);
  const seenSet = new Set(store.seenIds);
  const now = Date.now();

  for (const c of connections) {
    seenSet.add(c.id);
  }

  // Add full connection objects with seenAt timestamp
  const existingIds = new Set(store.connections.map((c) => c.id));
  for (const c of connections) {
    if (!existingIds.has(c.id)) {
      store.connections.push({ ...c, seenAt: now });
    }
  }

  write({ seenIds: [...seenSet], connections: store.connections }, clientId);
}

export function getConnectionsSince(
  since: number,
  clientId?: number,
): StoredConnection[] {
  const store = read(clientId);
  return store.connections.filter((c) => c.seenAt >= since);
}
