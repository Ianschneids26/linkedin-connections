import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface LinkedInConnection {
  id: string;
  firstName: string;
  lastName: string;
  headline: string;
  company: string;
  profileUrl: string;
  connectedAt: number;
}

const VOYAGER_BASE = "https://www.linkedin.com/voyager/api";
const CONNECTIONS_ENDPOINT = `${VOYAGER_BASE}/relationships/dash/connections`;

const JSESSIONID = "ajax:0000000000000000000";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Use curl instead of Node fetch to avoid TLS fingerprint detection
// by LinkedIn/Cloudflare, which blocks Node's undici-based fetch.
async function curlJson(url: string, liAtCookie: string): Promise<{ status: number; data: any }> {
  const cookies = `li_at=${liAtCookie}; JSESSIONID="${JSESSIONID}"`;
  const { stdout } = await execFileAsync("curl", [
    "-s",
    "-w", "\n__HTTP_STATUS__:%{http_code}",
    url,
    "-H", `cookie: ${cookies}`,
    "-H", `csrf-token: ${JSESSIONID}`,
    "-H", "x-li-lang: en_US",
    "-H", `x-li-track: ${JSON.stringify({ clientVersion: "1.13.8677", osName: "web" })}`,
    "-H", "x-restli-protocol-version: 2.0.0",
    "-H", `user-agent: ${USER_AGENT}`,
    "-H", "accept: application/vnd.linkedin.normalized+json+2.1",
  ], { maxBuffer: 10 * 1024 * 1024 });

  const statusMatch = stdout.match(/__HTTP_STATUS__:(\d+)$/);
  const status = statusMatch ? parseInt(statusMatch[1]) : 0;
  const body = stdout.replace(/__HTTP_STATUS__:\d+$/, "").trim();

  let data: any = null;
  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      // Not JSON — could be an error page
    }
  }

  return { status, data };
}

function parseConnections(data: any): LinkedInConnection[] {
  const connections: LinkedInConnection[] = [];
  const elements: any[] = data?.included ?? [];

  const profiles = new Map<string, any>();
  for (const el of elements) {
    if (el.$type?.includes("Profile")) {
      profiles.set(el.entityUrn, el);
    }
  }

  for (const el of elements) {
    if (el.$type?.includes("Connection")) {
      const profileUrn: string | undefined =
        el["*connectedMemberResolutionResult"] ??
        el["*connectedMember"] ??
        el["*miniProfile"];
      const profile = profileUrn ? profiles.get(profileUrn) : undefined;

      if (!profile) continue;

      const publicId: string = profile.publicIdentifier ?? "";
      const company =
        extractCompany(profile.headline) ??
        profile.memorialized?.company ??
        "";

      connections.push({
        id: profile.entityUrn ?? publicId,
        firstName: profile.firstName ?? "",
        lastName: profile.lastName ?? "",
        headline: profile.headline ?? "",
        company,
        profileUrl: publicId
          ? `https://www.linkedin.com/in/${publicId}`
          : "",
        connectedAt: el.createdAt ?? Date.now(),
      });
    }
  }

  return connections;
}

export async function fetchRecentConnections(
  liAtCookie: string,
  count = 40,
): Promise<LinkedInConnection[]> {
  const decorationIds = [
    "com.linkedin.voyager.dash.deco.web.mynetwork.ConnectionListWithProfile-5",
    "com.linkedin.voyager.dash.deco.web.mynetwork.ConnectionListWithProfile-4",
    "com.linkedin.voyager.dash.deco.web.mynetwork.ConnectionListWithProfile-3",
    "com.linkedin.voyager.dash.deco.web.mynetwork.ConnectionListWithProfile-2",
  ];

  for (const decorationId of decorationIds) {
    const params = new URLSearchParams({
      decorationId,
      count: String(count),
      q: "search",
      sortType: "RECENTLY_ADDED",
      start: "0",
    });

    const { status, data } = await curlJson(`${CONNECTIONS_ENDPOINT}?${params}`, liAtCookie);

    if (status === 200 && data?.included?.length > 0) {
      return parseConnections(data);
    }
  }

  // Fallback: try without decorationId
  const params = new URLSearchParams({
    count: String(count),
    q: "search",
    sortType: "RECENTLY_ADDED",
    start: "0",
  });

  const { status, data } = await curlJson(`${CONNECTIONS_ENDPOINT}?${params}`, liAtCookie);

  if (status === 302 || status === 301) {
    throw new Error("LinkedIn API returned 302 redirect — li_at cookie may be invalid");
  }

  if (status === 401 || status === 403) {
    throw new Error(`LinkedIn API error ${status}`);
  }

  if (status !== 200) {
    throw new Error(`LinkedIn API error ${status}: ${JSON.stringify(data)?.slice(0, 500)}`);
  }

  return parseConnections(data);
}

function extractCompany(headline: string | undefined): string | undefined {
  if (!headline) return undefined;
  const match = headline.match(/(?:\bat\b|@|\|)\s*(.+)$/i);
  return match?.[1]?.trim();
}
