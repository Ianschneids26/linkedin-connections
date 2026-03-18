import type { LinkedInConnection } from "./linkedin.js";
import type { StoredConnection } from "./store.js";

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

function connectionBlock(c: {
  firstName: string;
  lastName: string;
  headline: string;
  company: string;
  profileUrl: string;
  profileImageUrl?: string;
}): object[] {
  const name = `${c.firstName} ${c.lastName}`.trim();
  const title = c.headline || "No title";
  const company = c.company || "\u2014";

  const text = `*Person:* <${c.profileUrl}|${name}>\n*Title:* ${title}\n*Company:* ${company}`;

  const section: any = {
    type: "section",
    text: { type: "mrkdwn", text },
  };

  if (c.profileImageUrl) {
    section.accessory = {
      type: "image",
      image_url: c.profileImageUrl,
      alt_text: name,
    };
  }

  return [section];
}

export async function sendSlackMessage(
  webhookUrl: string,
  connections: LinkedInConnection[],
): Promise<void> {
  const headerText = `${connections.length} new LinkedIn connection${connections.length === 1 ? "" : "s"} today`;

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
    blocks.push(...connectionBlock(connections[i]));
  }

  await postToSlack(webhookUrl, { blocks, text: headerText });
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
    blocks.push(...connectionBlock(connections[i]));
  }

  await postToSlack(webhookUrl, { blocks, text: headerText });
}
