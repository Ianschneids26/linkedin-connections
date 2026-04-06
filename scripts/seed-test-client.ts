import "dotenv/config";
import { createClient, getAllClients } from "../src/db.js";

const existing = getAllClients();
if (existing.some((c) => c.email === "test@example.com")) {
  console.log("Test client already exists:");
  console.log(existing.find((c) => c.email === "test@example.com"));
  process.exit(0);
}

const client = createClient({
  name: "Test Client",
  email: "test@example.com",
  li_cookie: "FAKE_LI_AT_COOKIE_FOR_TESTING",
  slack_webhook: "https://hooks.slack.com/services/FAKE/WEBHOOK/URL",
});

console.log("Created test client:");
console.log(client);
