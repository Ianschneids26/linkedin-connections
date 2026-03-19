import Anthropic from "@anthropic-ai/sdk";
import type { LinkedInConnection } from "./linkedin.js";

const client = new Anthropic();

export async function generateOutreachDM(
  connection: LinkedInConnection,
): Promise<string> {
  const name = `${connection.firstName} ${connection.lastName}`.trim();

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Generate a LinkedIn DM using this exact structure:

"heyo just saw ur post on [reference what they posted about in 3-5 words]. so wanted to drop u a note. we work with superhuman and a ton of other [category e.g. saas / cpg / fintech] companies on product design. down for a quick chat later this week or next?"

Rules:
- All lowercase, no exceptions
- No commas, no exclamation points, no em dashes
- Periods only
- Under 200 characters
- Never change the structure, only fill in the brackets
- Keep heyo, ur, u exactly as written

Person name: ${name}
Headline: ${connection.headline}
Company: ${connection.company}

Respond with ONLY the DM text, nothing else.`,
      },
    ],
  });

  const block = response.content[0];
  if (block.type === "text") {
    return block.text.replace(/^["']|["']$/g, "").trim();
  }
  return "";
}
