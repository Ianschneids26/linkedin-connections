import Database from "better-sqlite3";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(path.dirname(new URL(import.meta.url).pathname), "..", "data");

const db = new Database(path.join(DATA_DIR, "linkedin-connections.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    li_cookie TEXT NOT NULL,
    slack_webhook TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export interface Client {
  id: number;
  name: string;
  email: string;
  li_cookie: string;
  slack_webhook: string;
  active: number;
  created_at: string;
}

export function getActiveClients(): Client[] {
  return db.prepare("SELECT * FROM clients WHERE active = 1").all() as Client[];
}

export function getAllClients(): Client[] {
  return db.prepare("SELECT * FROM clients ORDER BY created_at DESC").all() as Client[];
}

export function getClientById(id: number): Client | undefined {
  return db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as Client | undefined;
}

export function createClient(data: {
  name: string;
  email: string;
  li_cookie: string;
  slack_webhook: string;
}): Client {
  const stmt = db.prepare(
    "INSERT INTO clients (name, email, li_cookie, slack_webhook) VALUES (?, ?, ?, ?)",
  );
  const result = stmt.run(data.name, data.email, data.li_cookie, data.slack_webhook);
  return getClientById(Number(result.lastInsertRowid))!;
}

export function updateClient(
  id: number,
  data: Partial<Pick<Client, "name" | "email" | "li_cookie" | "slack_webhook" | "active">>,
): Client | undefined {
  const fields: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return getClientById(id);

  values.push(id);
  db.prepare(`UPDATE clients SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getClientById(id);
}

