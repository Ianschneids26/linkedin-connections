import type { LinkedInConnection } from "./linkedin.js";
import type { StoredConnection } from "./store.js";

export async function sendSlackText(
  webhookUrl: string,
  text: string,
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook error ${res.status}: ${body}`);
  }
}

export async function sendSlackMessage(
  webhookUrl: string,
  connections: LinkedInConnection[],
): Promise<void> {
  const header = `*${connections.length} new LinkedIn connection${connections.length === 1 ? "" : "s"} today:*\n`;

  const blocks = connections.map((c) => {
    const name = `${c.firstName} ${c.lastName}`.trim();
    const title = c.headline || "No title";
    const company = c.company || "—";
    return `*<${c.profileUrl}|${name}>*\n  • ${title}\n  • ${company}`;
  });

  const text = header + blocks.join("\n\n");

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook error ${res.status}: ${body}`);
  }
}

export async function sendRecapMessage(
  webhookUrl: string,
  connections: StoredConnection[],
): Promise<void> {
  let text: string;

  if (connections.length === 0) {
    text = "No new LinkedIn connections this week.";
  } else {
    const header = `*Weekly LinkedIn recap — ${connections.length} new connection${connections.length === 1 ? "" : "s"} this week:*\n`;

    const blocks = connections.map((c) => {
      const name = `${c.firstName} ${c.lastName}`.trim();
      const title = c.headline || "No title";
      const company = c.company || "—";
      return `*<${c.profileUrl}|${name}>*\n  • ${title}\n  • ${company}`;
    });

    text = header + blocks.join("\n\n");
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook error ${res.status}: ${body}`);
  }
}
