import "dotenv/config";
import { getConnectionsSince } from "./store.js";
import { sendRecapMessage } from "./slack.js";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("Missing SLACK_WEBHOOK_URL in .env");
    process.exit(1);
  }

  const since = Date.now() - TWENTY_FOUR_HOURS_MS;
  const connections = getConnectionsSince(since);

  console.log(`Recap: ${connections.length} connection(s) in the last 24h`);
  await sendRecapMessage(webhookUrl, connections);
  console.log("Recap sent to Slack");
}

main().catch((err) => {
  console.error("Recap failed:", err);
  process.exit(1);
});
