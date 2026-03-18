import fs from "node:fs";
import path from "node:path";
import type { LinkedInConnection } from "./linkedin.js";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(path.dirname(new URL(import.meta.url).pathname), "..", "data");
const STORE_PATH = path.join(DATA_DIR, "seen-connections.json");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredConnection = LinkedInConnection & { seenAt: number };

interface StoreData {
  seenIds: string[];
  connections: StoredConnection[];
}

function read(): StoreData {
  if (!fs.existsSync(STORE_PATH)) {
    return { seenIds: [], connections: [] };
  }
  const raw = fs.readFileSync(STORE_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return {
    seenIds: parsed.seenIds ?? [],
    connections: parsed.connections ?? [],
  };
}

function write(data: StoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  // Prune connections older than 7 days
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  data.connections = data.connections.filter((c) => c.seenAt >= cutoff);
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

export function filterNewConnections(
  connections: LinkedInConnection[],
): LinkedInConnection[] {
  const store = read();
  const seenSet = new Set(store.seenIds);
  return connections.filter((c) => !seenSet.has(c.id));
}

export function markAsSeen(connections: LinkedInConnection[]): void {
  const store = read();
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

  write({ seenIds: [...seenSet], connections: store.connections });
}

export function getConnectionsSince(since: number): StoredConnection[] {
  const store = read();
  return store.connections.filter((c) => c.seenAt >= since);
}
