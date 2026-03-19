import type { LinkedInConnection } from "./linkedin.js";
import type { StoredConnection } from "./store.js";

export interface ConnectionWithDM extends LinkedInConnection {
  suggestedDM: string;
}

async function postToSlack(webhookUrl: string, payload: object): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook error ${res.status}: ${body}`);
  }
}

export async function sendSlackText(
  webhookUrl: string,
  text: string,
): Promise<void> {
  await postToSlack(webhookUrl, { text });
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
}

function connectionBlocks(c: ConnectionWithDM): object[] {
  const name = `${c.firstName} ${c.lastName}`.trim() || "Unknown";
  const title = c.headline || "No title";
  const company = c.company || "—";
  const safeId = sanitizeId(c.id);
  const dmText = (c.suggestedDM || "no dm generated").replace(/[\n\r]+/g, " ").trim();
  const personText = c.profileUrl ? `<${c.profileUrl}|${name}>` : name;

  const blocks: object[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Person:* ${personText}\n*Title:* ${title}\n*Company:* ${company}`,
      },
    },
  ];

  if (c.suggestedDM) {
    blocks.push(
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*suggested dm:*\n>${dmText}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "DM on LinkedIn", emoji: true },
            style: "primary",
            url: c.profileUrl || "https://www.linkedin.com",
            action_id: `dm_${safeId}`,
          },
        ],
      },
    );
  }

  return blocks;
}

export async function sendSlackMessage(
  webhookUrl: string,
  connections: ConnectionWithDM[],
): Promise<void> {
  for (const connection of connections) {
    const name = `${connection.firstName} ${connection.lastName}`.trim();
    const blocks: object[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `New LinkedIn connection: ${name}`, emoji: true },
      },
      ...connectionBlocks(connection),
    ];

    try {
      await postToSlack(webhookUrl, { blocks, text: `New connection: ${name}` });
    } catch (err: any) {
      console.error(`Failed to send Slack message for ${name}: ${err?.message}`);
    }
  }
}

export async function sendRecapMessage(
  webhookUrl: string,
  connections: StoredConnection[],
): Promise<void> {
  if (connections.length === 0) {
    await postToSlack(webhookUrl, {
      text: "No new LinkedIn connections this week.",
    });
    return;
  }

  const headerText = `Weekly recap: ${connections.length} new connection${connections.length === 1 ? "" : "s"} this week`;
  const lines = connections.map((c) => {
    const name = `${c.firstName} ${c.lastName}`.trim();
    const title = c.headline || "No title";
    return `• *${name}* — ${title}`;
  });

  await postToSlack(webhookUrl, { text: `${headerText}\n\n${lines.join("\n")}` });
}
