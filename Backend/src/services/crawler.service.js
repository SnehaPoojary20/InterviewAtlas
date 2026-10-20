
import axios from "axios";
import * as cheerio from "cheerio";

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const REQUEST_TIMEOUT = 10000;
const MAX_PAGES = 5;
const MAX_TEXT_PER_PAGE = 12000;
const MAX_TOTAL_TEXT = 40000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36";

// --------------------------------------------------
// 1. Fetch a webpage safely
// --------------------------------------------------

async function fetchPageWithTimeout(url) {
  try {
    const response = await axios.get(url, {
      timeout: REQUEST_TIMEOUT,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      maxRedirects: 5,
      responseType: "text",
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const contentType = String(
      response.headers["content-type"] || ""
    ).toLowerCase();

    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      console.warn(`Skipping non-HTML page: ${url}`);
      return null;
    }

    if (typeof response.data !== "string") {
      console.warn(`Unexpected response content: ${url}`);
      return null;
    }

    return response.data;
  } catch (error) {
    const reason =
      error.response?.status
        ? `HTTP ${error.response.status}`
        : error.code || error.message;

    console.warn(`Failed to fetch ${url}: ${reason}`);
    return null;
  }
}

// --------------------------------------------------
// 2. Validate and normalize the website URL
// --------------------------------------------------

function normalizeBaseUrl(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("A valid company URL is required.");
  }

  let parsed;

  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error(`Invalid company URL: ${input}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Company URL must use HTTP or HTTPS.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Company URL must not contain embedded credentials.");
  }

  parsed.hash = "";

  return parsed;
}

// --------------------------------------------------
// 3. Extract readable text from HTML
// --------------------------------------------------

function extractText(html) {
  const $ = cheerio.load(html);

  // Remove elements that rarely contain useful company information.
  $(
    "script, style, noscript, iframe, svg, canvas, " +
    "nav, footer, header, form, button, input, " +
    "[aria-hidden='true']"
  ).remove();

  const text = $("body").text() || $.root().text();

  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, MAX_TEXT_PER_PAGE);
}

// --------------------------------------------------
// 4. Discover same-host HTML links
// --------------------------------------------------

function discoverLinks(html, currentUrl, allowedHostname) {
  const $ = cheerio.load(html);
  const links = new Set();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) return;

    const trimmedHref = href.trim();

    // Skip anchors, scripts, emails, phone numbers, and other non-page links.
    if (
      !trimmedHref ||
      trimmedHref.startsWith("#") ||
      /^(javascript:|mailto:|tel:|data:)/i.test(trimmedHref)
    ) {
      return;
    }

    try {
      const absoluteUrl = new URL(trimmedHref, currentUrl);

      if (!["http:", "https:"].includes(absoluteUrl.protocol)) {
        return;
      }

      // Restrict crawling to the original hostname.
      if (absoluteUrl.hostname !== allowedHostname) {
        return;
      }

      // Skip likely assets and documents.
      if (
        /\.(pdf|png|jpe?g|gif|svg|webp|ico|css|js|zip|xml|json|mp4|mp3)(?:$|[?#])/i.test(
          absoluteUrl.pathname
        )
      ) {
        return;
      }

      absoluteUrl.hash = "";

      // Remove common tracking parameters.
      for (const key of [...absoluteUrl.searchParams.keys()]) {
        if (
          key.startsWith("utm_") ||
          ["gclid", "fbclid"].includes(key.toLowerCase())
        ) {
          absoluteUrl.searchParams.delete(key);
        }
      }

      // Avoid duplicate URLs caused by trailing slashes.
      if (absoluteUrl.pathname.length > 1) {
        absoluteUrl.pathname = absoluteUrl.pathname.replace(/\/+$/, "");
      }

      links.add(absoluteUrl.href);
    } catch {
      // Ignore malformed links.
    }
  });

  return [...links];
}

// --------------------------------------------------
// 5. Crawl the company website
// --------------------------------------------------

export async function crawlCompanySite(companyUrl) {
  let baseUrl;

  try {
    baseUrl = normalizeBaseUrl(companyUrl);
  } catch (error) {
    console.warn(`Crawler configuration error: ${error.message}`);

    return {
      pagesUsed: [],
      textContent: "",
    };
  }

  const pagesUsed = [];
  const visited = new Set();
  const queued = new Set();

  const queue = [baseUrl.href];
  queued.add(baseUrl.href);

  const textParts = [];
  let totalTextLength = 0;

  while (
    queue.length > 0 &&
    pagesUsed.length < MAX_PAGES &&
    totalTextLength < MAX_TOTAL_TEXT
  ) {
    const currentUrl = queue.shift();

    if (!currentUrl || visited.has(currentUrl)) {
      continue;
    }

    visited.add(currentUrl);

    console.log(`Crawling: ${currentUrl}`);

    const html = await fetchPageWithTimeout(currentUrl);

    if (!html) {
      continue;
    }

    // Follow redirects only when they remain on the original hostname.
    // axios exposes the final URL through response.request.res.responseUrl,
    // but fetchPageWithTimeout returns only HTML. The original requested URL
    // is therefore recorded here.
    const pageText = extractText(html);

    if (!pageText) {
      continue;
    }

    pagesUsed.push(currentUrl);

    const remainingText = MAX_TOTAL_TEXT - totalTextLength;
    const limitedText = pageText.slice(0, remainingText);

    textParts.push(`SOURCE: ${currentUrl}\n${limitedText}`);
    totalTextLength += limitedText.length;

    // Discover additional pages only while capacity remains.
    if (
      pagesUsed.length < MAX_PAGES &&
      totalTextLength < MAX_TOTAL_TEXT
    ) {
      const links = discoverLinks(
        html,
        currentUrl,
        baseUrl.hostname
      );

      for (const link of links) {
        if (
          !visited.has(link) &&
          !queued.has(link) &&
          queue.length + pagesUsed.length < MAX_PAGES * 3
        ) {
          queue.push(link);
          queued.add(link);
        }
      }
    }
  }

  const textContent = textParts.join("\n\n").slice(0, MAX_TOTAL_TEXT);

  console.log(
    `Crawl completed: ${pagesUsed.length} page(s), ` +
    `${textContent.length} characters extracted.`
  );

  return {
    pagesUsed,
    textContent,
  };
}



    



