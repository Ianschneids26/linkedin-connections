import type { LinkedInConnection } from "./linkedin.js";
import type { StoredConnection } from "./store.js";

export interface ConnectionWithDM extends LinkedInConnection {
  suggestedDM: string;
}

async function postToSlack(webhookUrl: string, payload: object): Promise<void> {
  const jsonBody = JSON.stringify(payload);
  console.log(`[DEBUG] Slack payload (first 2000 chars): ${jsonBody.slice(0, 2000)}`);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: jsonBody,
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
  const name = `${c.firstName} ${c.lastName}`.trim();
  const title = c.headline || "No title";
  const company = c.company || "\u2014";
  const safeId = sanitizeId(c.id);

  const personText = c.profileUrl ? `<${c.profileUrl}|${name}>` : name;
  const infoText = `*Person:* ${personText}\n*Title:* ${title}\n*Company:* ${company}`;

  const section: any = {
    type: "section",
    text: { type: "mrkdwn", text: infoText },
  };

  if (c.profileImageUrl && c.profileImageUrl.startsWith("https://")) {
    section.accessory = {
      type: "image",
      image_url: c.profileImageUrl,
      alt_text: name,
    };
  }

  const blocks: object[] = [section];

  const dmText = (c.suggestedDM || "").replace(/[\n\r]+/g, " ").trim();

  if (dmText) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*suggested dm:*\n>${dmText}`,
      },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "accept", emoji: true },
        style: "primary",
        action_id: `accept_${safeId}`,
        value: dmText || "no dm generated",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "edit", emoji: true },
        action_id: `edit_${safeId}`,
        value: dmText || "no dm generated",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "reject", emoji: true },
        style: "danger",
        action_id: `reject_${safeId}`,
      },
    ],
  });

  return blocks;
}

export async function sendSlackMessage(
  webhookUrl: string,
  connections: ConnectionWithDM[],
): Promise<void> {
  const headerText = `${connections.length} new LinkedIn connection${connections.length === 1 ? "" : "s"} today`;

  // Send one message per connection to avoid Slack's 50 block limit
  for (const connection of connections) {
    const blocks: object[] = [
      {
        type: "header",
        text: { type: "plain_text", text: headerText, emoji: true },
      },
      ...connectionBlocks(connection),
    ];

    await postToSlack(webhookUrl, { blocks, text: headerText });
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

  const headerText = `Weekly LinkedIn recap \u2014 ${connections.length} new connection${connections.length === 1 ? "" : "s"} this week`;

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
  ];

  for (let i = 0; i < connections.length; i++) {
    if (i > 0) {
      blocks.push({ type: "divider" });
    }
    const name = `${connections[i].firstName} ${connections[i].lastName}`.trim();
    const title = connections[i].headline || "No title";
    const company = connections[i].company || "\u2014";
    const infoText = `*Person:* <${connections[i].profileUrl}|${name}>\n*Title:* ${title}\n*Company:* ${company}`;
    const section: any = {
      type: "section",
      text: { type: "mrkdwn", text: infoText },
    };
    if (connections[i].profileImageUrl) {
      section.accessory = {
        type: "image",
        image_url: connections[i].profileImageUrl,
        alt_text: name,
      };
    }
    blocks.push(section);
  }

  await postToSlack(webhookUrl, { blocks, text: headerText });
}
