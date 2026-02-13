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

async function getSessionCookies(
  liAtCookie: string,
): Promise<{ jsessionid: string; allCookies: string }> {
  const res = await fetch("https://www.linkedin.com/", {
    headers: {
      cookie: `li_at=${liAtCookie}`,
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    redirect: "manual",
  });

  const setCookies = res.headers.getSetCookie?.() ?? [];
  let jsessionid = "";
  for (const cookie of setCookies) {
    const match = cookie.match(/JSESSIONID="?([^";]+)"?/);
    if (match) {
      jsessionid = match[1];
      break;
    }
  }

  if (!jsessionid) {
    throw new Error("Failed to obtain JSESSIONID from LinkedIn");
  }

  return {
    jsessionid,
    allCookies: `li_at=${liAtCookie}; JSESSIONID="${jsessionid}"`,
  };
}

function buildHeaders(
  allCookies: string,
  jsessionid: string,
): Record<string, string> {
  return {
    cookie: allCookies,
    "csrf-token": jsessionid,
    "x-li-lang": "en_US",
    "x-li-track": JSON.stringify({
      clientVersion: "1.13.8677",
      osName: "web",
    }),
    "x-restli-protocol-version": "2.0.0",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    accept: "application/vnd.linkedin.normalized+json+2.1",
  };
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
  const { jsessionid, allCookies } = await getSessionCookies(liAtCookie);
  const headers = buildHeaders(allCookies, jsessionid);

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

    const res = await fetch(`${CONNECTIONS_ENDPOINT}?${params}`, { headers });

    if (res.ok) {
      const data: any = await res.json();
      if (data?.included?.length > 0) {
        return parseConnections(data);
      }
    }
  }

  // Fallback: try without decorationId
  const params = new URLSearchParams({
    count: String(count),
    q: "search",
    sortType: "RECENTLY_ADDED",
    start: "0",
  });

  const res = await fetch(`${CONNECTIONS_ENDPOINT}?${params}`, { headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `LinkedIn API error ${res.status}: ${body.slice(0, 500)}`,
    );
  }

  const data: any = await res.json();
  return parseConnections(data);
}

function extractCompany(headline: string | undefined): string | undefined {
  if (!headline) return undefined;
  const match = headline.match(/(?:\bat\b|@|\|)\s*(.+)$/i);
  return match?.[1]?.trim();
}
