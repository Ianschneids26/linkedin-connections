export interface LinkedInConnection {
  id: string;
  firstName: string;
  lastName: string;
  headline: string;
  company: string;
  profileUrl: string;
  profileImageUrl: string;
  connectedAt: number;
}

const VOYAGER_BASE = "https://www.linkedin.com/voyager/api";
const CONNECTIONS_ENDPOINT = `${VOYAGER_BASE}/relationships/dash/connections`;

async function voyagerFetch(
  url: string,
  liAtCookie: string,
  csrfToken: string,
): Promise<{ status: number; data: any }> {
  try {
    const headers = {
      "csrf-token": csrfToken,
      "cookie": `li_at=${liAtCookie}; JSESSIONID="${csrfToken}"`,
      "x-li-lang": "en_US",
      "x-li-track": JSON.stringify({ clientVersion: "1.13.8677", osName: "web" }),
      "x-restli-protocol-version": "2.0.0",
      "accept": "application/vnd.linkedin.normalized+json+2.1",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    let resp = await fetch(url, { headers, redirect: "manual" });

    // Follow up to 3 redirects manually (preserving cookies)
    for (let i = 0; i < 3 && resp.status >= 300 && resp.status < 400; i++) {
      const location = resp.headers.get("location");
      if (!location) break;
      const redirectUrl = location.startsWith("http") ? location : `https://www.linkedin.com${location}`;
      console.log(`[DEBUG] Following redirect ${i + 1} to ${redirectUrl.slice(0, 100)}`);
      if (redirectUrl.includes("/login") || redirectUrl.includes("/authwall")) {
        throw new Error(`LinkedIn auth redirect — li_at cookie may be invalid`);
      }
      resp = await fetch(redirectUrl, { headers, redirect: "manual" });
    }

    const status = resp.status;
    let data = null;
    try {
      data = await resp.json();
    } catch {
      // Not JSON
    }
    return { status, data };
  } catch (err: any) {
    console.error(`[DEBUG] Voyager fetch error: ${err?.message}, cause: ${err?.cause?.message ?? "none"}`);
    throw err;
  }
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
        profileImageUrl: extractProfileImage(profile),
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
  // Generate our own CSRF token — LinkedIn just requires the cookie and header to match
  const csrfToken = `ajax:${Date.now()}`;
  console.log(`[DEBUG] Using self-generated CSRF token`);

  // Try decoration IDs from newest to oldest
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

    const { status, data } = await voyagerFetch(
      `${CONNECTIONS_ENDPOINT}?${params}`,
      liAtCookie,
      csrfToken,
    );

    if (status === 401 || status === 403) {
      throw new Error(`LinkedIn API auth error ${status} — li_at cookie may be invalid`);
    }

    console.log(`[DEBUG] Decoration ${decorationId}: status=${status}, hasData=${!!data?.included?.length}`);

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

  const { status, data } = await voyagerFetch(
    `${CONNECTIONS_ENDPOINT}?${params}`,
    liAtCookie,
    csrfToken,
  );

  if (status === 401 || status === 403) {
    throw new Error(`LinkedIn API auth error ${status} — li_at cookie may be invalid`);
  }

  if (status !== 200) {
    throw new Error(`LinkedIn Voyager API error ${status}: ${JSON.stringify(data)?.slice(0, 500)}`);
  }

  return parseConnections(data);
}

function extractProfileImage(profile: any): string {
  const picture =
    profile.profilePicture?.displayImageReference?.vectorImage ??
    profile.picture?.displayImageReference?.vectorImage;
  if (!picture?.artifacts?.length || !picture.rootUrl) return "";
  // Pick the largest artifact
  const sorted = [...picture.artifacts].sort(
    (a: any, b: any) => (b.width ?? 0) - (a.width ?? 0),
  );
  return picture.rootUrl + sorted[0].fileIdentifyingUrlPathSegment;
}

function extractCompany(headline: string | undefined): string | undefined {
  if (!headline) return undefined;
  const match = headline.match(/(?:\bat\b|@|\|)\s*(.+)$/i);
  return match?.[1]?.trim();
}
