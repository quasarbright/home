// Runs one of the portfolio's background projects behind the page and credits it.
//
// The list comes from the deployed portfolio, so it stays the single source of truth.
// Projection doesn't deploy projects.yaml (the copy at /portfolio/projects.yaml is a stale
// leftover), but it embeds every project plus the config in the portfolio page as
// `window.PROJECTS_DATA = {...};`, so we read that. If projection ever writes a
// /portfolio/projects.json, that gets used first.
//
// ?bg=<text> picks the first background whose URL contains <text> (handy for checking contrast).

const PORTFOLIO_JSON_URL = "/portfolio/projects.json";
const PORTFOLIO_PAGE_URL = "/portfolio/";

// ---------- pure helpers (exposed on window.home for tests) ----------

function extractProjectsData(html) {
  const marker = "window.PROJECTS_DATA = ";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("PROJECTS_DATA not found in portfolio page");
  const end = html.indexOf("</script>", start);
  const body = html.slice(start + marker.length, end).trim().replace(/;$/, "");
  return JSON.parse(body);
}

async function loadPortfolio() {
  const json = await fetch(PORTFOLIO_JSON_URL).catch(() => null);
  if (json?.ok && (json.headers.get("content-type") || "").includes("json")) return json.json();
  const page = await fetch(PORTFOLIO_PAGE_URL);
  if (!page.ok) throw new Error(`portfolio page: ${page.status}`);
  return extractProjectsData(await page.text());
}

// Strip query, hash and trailing slash so a background URL can be matched to a project's pageLink.
function normalizeUrl(u) {
  try {
    const url = new URL(u, location.href);
    return (url.origin + url.pathname).replace(/\/+$/, "");
  } catch {
    return u;
  }
}

// Background list: projects with a `background:` field win; otherwise the config list.
// `background` is either a full URL or a query string appended to the project's pageLink.
function backgroundsFrom(data) {
  const projects = data.projects || [];
  const fromProjects = projects
    .filter((p) => p.background)
    .map((p) => ({
      url: /^https?:/.test(p.background)
        ? p.background
        : p.pageLink + (p.background === true ? "?background" : p.background),
      project: p,
    }));
  if (fromProjects.length) return fromProjects;

  const byLink = new Map(projects.map((p) => [normalizeUrl(p.pageLink), p]));
  return (data.config?.dynamicBackgrounds || []).map((url) => ({
    url,
    project: byLink.get(normalizeUrl(url)) || null,
  }));
}

function titleFromUrl(url) {
  const seg = normalizeUrl(url).split("/").pop() || "Background";
  return seg.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// ---------- background ----------

function setupBackground(backgrounds) {
  const iframe = document.getElementById("background");
  const credit = document.getElementById("credit");
  const link = document.getElementById("credit-link");
  const shuffle = document.getElementById("shuffle");
  if (!backgrounds.length) return;

  let current = -1;
  function load(i) {
    current = i;
    const bg = backgrounds[i];
    const sep = bg.url.includes("?") ? "&" : "?";
    iframe.classList.remove("ready");
    iframe.src = /[?&]background\b/.test(bg.url) ? bg.url : bg.url + sep + "background=true";
    link.textContent = bg.project?.title || titleFromUrl(bg.url);
    link.href = bg.project?.pageLink || bg.url.replace(/[?&]background(=[^&]*)?/, "");
    credit.hidden = false;
    shuffle.hidden = backgrounds.length < 2;
  }
  iframe.addEventListener("load", () => iframe.classList.add("ready"));

  shuffle.addEventListener("click", () => {
    let next = current;
    while (backgrounds.length > 1 && next === current) next = Math.floor(Math.random() * backgrounds.length);
    load(next);
  });

  // The page's own text sits over the iframe, so pointer moves there never reach it natively.
  // Forward them the same way the portfolio does; background projects listen for this message.
  document.addEventListener("mousemove", (e) => {
    iframe.contentWindow?.postMessage(
      { type: "mousemove", x: e.clientX, y: e.clientY, pageX: e.pageX, pageY: e.pageY },
      "*"
    );
  });

  const want = new URLSearchParams(location.search).get("bg");
  const picked = want ? backgrounds.findIndex((b) => b.url.includes(want)) : -1;
  load(picked >= 0 ? picked : Math.floor(Math.random() * backgrounds.length));
}

// ---------- boot ----------

async function main() {
  try {
    setupBackground(backgroundsFrom(await loadPortfolio()));
  } catch (err) {
    console.warn("Could not load the portfolio's backgrounds:", err);
  }
}

window.home = { extractProjectsData, normalizeUrl, backgroundsFrom, titleFromUrl };
main();
