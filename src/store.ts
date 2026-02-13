import fs from "node:fs";
import path from "node:path";
import type { LinkedInConnection } from "./linkedin.js";

const DATA_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "data",
);
const STORE_PATH = path.join(DATA_DIR, "seen-connections.json");

interface StoreData {
  seenIds: string[];
}

function read(): StoreData {
  if (!fs.existsSync(STORE_PATH)) {
    return { seenIds: [] };
  }
  const raw = fs.readFileSync(STORE_PATH, "utf-8");
  return JSON.parse(raw) as StoreData;
}

function write(data: StoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
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
  for (const c of connections) {
    seenSet.add(c.id);
  }
  write({ seenIds: [...seenSet] });
}
