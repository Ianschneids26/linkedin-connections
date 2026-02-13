import type { LinkedInConnection } from "./linkedin.js";

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

  const lines = connections.map((c) => {
    const name = `${c.firstName} ${c.lastName}`.trim();
    const title = c.headline || "No title";
    const company = c.company || "—";
    return `• <${c.profileUrl}|${name}> — ${title} · ${company}`;
  });

  const text = header + lines.join("\n");

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
