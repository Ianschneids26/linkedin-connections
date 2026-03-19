const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const HIRING_CHANNEL_ID = "C0ALPVD9WG7";

export async function isFlaggedInHiringChannel(
  firstName: string,
  lastName: string,
  profileUrl: string,
): Promise<boolean> {
  if (!SLACK_BOT_TOKEN) {
    console.error("SLACK_BOT_TOKEN required for hiring channel check");
    return false;
  }

  const name = `${firstName} ${lastName}`.trim().toLowerCase();

  // Fetch recent messages from the hiring notifs channel
  const res = await fetch(
    `https://slack.com/api/conversations.history?channel=${HIRING_CHANNEL_ID}&limit=200`,
    {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    },
  );

  if (!res.ok) {
    console.error(`Failed to fetch hiring channel: ${res.status}`);
    return false;
  }

  const data: any = await res.json();
  if (!data.ok) {
    console.error(`Slack API error: ${data.error}`);
    return false;
  }

  const messages: any[] = data.messages ?? [];

  for (const msg of messages) {
    const text = (msg.text ?? "").toLowerCase();
    // Match by full name or profile URL
    if (text.includes(name) || (profileUrl && text.includes(profileUrl))) {
      return true;
    }
  }

  return false;
}
