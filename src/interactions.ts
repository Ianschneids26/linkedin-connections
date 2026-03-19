import express from "express";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

export function startInteractionServer(port = 3000): void {
  const app = express();
  app.use(express.urlencoded({ extended: true }));

  app.post("/slack/interactions", async (req, res) => {
    const payload = JSON.parse(req.body.payload);

    try {
      if (payload.type === "block_actions") {
        await handleBlockAction(payload);
      } else if (payload.type === "view_submission") {
        await handleViewSubmission(payload);
        res.json({ response_action: "clear" });
        return;
      }
    } catch (err: any) {
      console.error("Interaction error:", err?.message);
    }

    res.status(200).send();
  });

  app.listen(port, () => {
    console.log(`  - Interaction server: port ${port}`);
  });
}

async function handleBlockAction(payload: any): Promise<void> {
  const action = payload.actions?.[0];
  if (!action) return;

  const actionId: string = action.action_id;
  const responseUrl: string = payload.response_url;
  const triggerId: string = payload.trigger_id;

  if (actionId.startsWith("accept_")) {
    const dmText = action.value;
    const profileUrl = extractProfileUrl(payload);
    const messagingUrl = profileUrl
      ? profileUrl.replace(/\/?$/, "") + "/"
      : "";

    await updateMessage(responseUrl, {
      replace_original: true,
      blocks: [
        ...getInfoBlocks(payload),
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*suggested dm:*\n>${dmText}`,
          },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: ":white_check_mark: *dm accepted*" },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "send on linkedin", emoji: true },
              style: "primary",
              url: messagingUrl,
            },
          ],
        },
      ],
    });
  } else if (actionId.startsWith("edit_")) {
    const dmText = action.value;
    const profileUrl = extractProfileUrl(payload);

    if (!SLACK_BOT_TOKEN) {
      console.error("SLACK_BOT_TOKEN required for edit modal");
      return;
    }

    await fetch("https://slack.com/api/views.open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        trigger_id: triggerId,
        view: {
          type: "modal",
          callback_id: "edit_dm_modal",
          private_metadata: JSON.stringify({ responseUrl, profileUrl }),
          title: { type: "plain_text", text: "edit dm" },
          submit: { type: "plain_text", text: "confirm" },
          close: { type: "plain_text", text: "cancel" },
          blocks: [
            {
              type: "input",
              block_id: "dm_input_block",
              element: {
                type: "plain_text_input",
                action_id: "dm_text",
                multiline: true,
                initial_value: dmText,
              },
              label: { type: "plain_text", text: "edit your dm" },
            },
          ],
        },
      }),
    });
  } else if (actionId.startsWith("reject_")) {
    const profileUrl = extractProfileUrl(payload);

    await updateMessage(responseUrl, {
      replace_original: true,
      blocks: [
        ...getInfoBlocks(payload),
        {
          type: "section",
          text: { type: "mrkdwn", text: ":x: *message rejected*" },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "view profile", emoji: true },
              url: profileUrl,
            },
          ],
        },
      ],
    });
  }
}

async function handleViewSubmission(payload: any): Promise<void> {
  const values = payload.view.state.values;
  const editedDM = values.dm_input_block.dm_text.value;
  const { responseUrl, profileUrl } = JSON.parse(
    payload.view.private_metadata,
  );

  const messagingUrl = profileUrl
    ? profileUrl.replace(/\/?$/, "") + "/"
    : "";

  await updateMessage(responseUrl, {
    replace_original: true,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*edited dm:*\n>${editedDM}`,
        },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: ":pencil2: *dm edited and accepted*" },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "send on linkedin", emoji: true },
            style: "primary",
            url: messagingUrl,
          },
        ],
      },
    ],
  });
}

async function updateMessage(
  responseUrl: string,
  body: object,
): Promise<void> {
  const res = await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Failed to update message:", text);
  }
}

function extractProfileUrl(payload: any): string {
  const blocks: any[] = payload.message?.blocks ?? [];
  for (const block of blocks) {
    const text: string = block.text?.text ?? "";
    const match = text.match(/https:\/\/www\.linkedin\.com\/in\/[^\s|>]+/);
    if (match) return match[0];
  }
  return "";
}

function getInfoBlocks(payload: any): object[] {
  const blocks: any[] = payload.message?.blocks ?? [];
  // Keep the header and the person info section (first two blocks)
  return blocks.filter(
    (b: any) =>
      b.type === "header" ||
      (b.type === "section" && b.text?.text?.includes("*Person:*")),
  );
}
