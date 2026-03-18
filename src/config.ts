import fs from "node:fs";
import path from "node:path";

export interface Config {
  client_name: string;
  slack_channel: string;
  polling_interval_minutes: number;
  weekly_recap_enabled: boolean;
  weekly_recap_day: string;
  weekly_recap_time_utc: string;
  max_connections_to_fetch: number;
}

const CONFIG_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "config.json",
);

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function load(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`config.json not found at ${CONFIG_PATH}`);
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as Config;
}

export const config = load();

/** Build a cron expression like "* /30 * * * *" from polling_interval_minutes. */
export function pollingCron(): string {
  return `*/${config.polling_interval_minutes} * * * *`;
}

/** Build a cron expression like "0 6 * * 1" from weekly_recap_day + weekly_recap_time_utc. */
export function recapCron(): string {
  const day = DAY_MAP[config.weekly_recap_day.toLowerCase()];
  if (day === undefined) {
    throw new Error(
      `Invalid weekly_recap_day "${config.weekly_recap_day}". Use a day name like "Monday".`,
    );
  }
  const [hour, minute] = config.weekly_recap_time_utc.split(":");
  return `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * ${day}`;
}
