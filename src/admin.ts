import { Router, type Request, type Response, type NextFunction } from "express";
import { getAllClients, createClient, updateClient, getClientById } from "./db.js";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ error: "ADMIN_PASSWORD not configured" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Basic ")) {
    res.status(401).json({ error: "Missing Basic auth header" });
    return;
  }

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const [, password] = decoded.split(":");

  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  next();
}

export function adminRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // List all clients
  router.get("/clients", (_req: Request, res: Response) => {
    const clients = getAllClients();
    // Redact sensitive fields in list view
    const redacted = clients.map((c) => ({
      ...c,
      li_cookie: c.li_cookie.slice(0, 8) + "...",
    }));
    res.json(redacted);
  });

  // Add a new client
  router.post("/clients", (req: Request, res: Response) => {
    const { name, email, li_cookie, slack_webhook } = req.body ?? {};

    if (!name || !email || !li_cookie || !slack_webhook) {
      res.status(400).json({ error: "name, email, li_cookie, and slack_webhook are required" });
      return;
    }

    try {
      const client = createClient({ name, email, li_cookie, slack_webhook });
      res.status(201).json(client);
    } catch (err: any) {
      if (err?.message?.includes("UNIQUE constraint")) {
        res.status(409).json({ error: "A client with that email already exists" });
        return;
      }
      throw err;
    }
  });

  // Update an existing client
  router.put("/clients/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid client ID" });
      return;
    }

    const existing = getClientById(id);
    if (!existing) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    const { name, email, li_cookie, slack_webhook, active } = req.body ?? {};
    const client = updateClient(id, { name, email, li_cookie, slack_webhook, active });
    res.json(client);
  });

  return router;
}
