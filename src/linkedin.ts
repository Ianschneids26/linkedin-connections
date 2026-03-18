import { chromium, type Page } from "playwright";

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
  page: Page,
  url: string,
  csrfToken: string,
): Promise<{ status: number; data: any }> {
  return page.evaluate(async ({ url, csrfToken }) => {
    const resp = await fetch(url, {
      headers: {
        "csrf-token": csrfToken,
        "x-li-lang": "en_US",
        "x-li-track": JSON.stringify({ clientVersion: "1.13.8677", osName: "web" }),
        "x-restli-protocol-version": "2.0.0",
        "accept": "application/vnd.linkedin.normalized+json+2.1",
      },
      credentials: "include",
    });
    const status = resp.status;
    let data = null;
    try {
      data = await resp.json();
    } catch {
      // Not JSON
    }
    return { status, data };
  }, { url, csrfToken });
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
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to LinkedIn login page (public) to establish session cookies
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Inject li_at auth cookie
    await context.addCookies([
      {
        name: "li_at",
        value: liAtCookie,
        domain: ".linkedin.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None",
      },
    ]);

    // Navigate to an authenticated page to confirm session and get CSRF token
    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 30_000 });

    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/checkpoint")) {
      throw new Error(`LinkedIn auth redirect to ${currentUrl} — li_at cookie may be invalid`);
    }

    // Get the JSESSIONID that LinkedIn set (used as CSRF token)
    const cookies = await context.cookies();
    const jsessionCookie = cookies.find(c => c.name === "JSESSIONID");
    const csrfToken = (jsessionCookie?.value ?? "").replace(/"/g, "");

    if (!csrfToken) {
      throw new Error("No JSESSIONID cookie found — cannot make API calls");
    }

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
        page,
        `${CONNECTIONS_ENDPOINT}?${params}`,
        csrfToken,
      );

      if (status === 401 || status === 403) {
        throw new Error(`LinkedIn API auth error ${status} — li_at cookie may be invalid`);
      }

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
      page,
      `${CONNECTIONS_ENDPOINT}?${params}`,
      csrfToken,
    );

    if (status === 401 || status === 403) {
      throw new Error(`LinkedIn API auth error ${status} — li_at cookie may be invalid`);
    }

    if (status !== 200) {
      throw new Error(`LinkedIn Voyager API error ${status}: ${JSON.stringify(data)?.slice(0, 500)}`);
    }

    return parseConnections(data);
  } finally {
    await browser.close();
  }
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
