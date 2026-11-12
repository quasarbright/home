// Reads the portfolio's data and the blog's Atom feed (same origin as /home/),
// fills in the index, and runs one of the portfolio's background projects behind the page.
//
// Projection doesn't deploy projects.yaml (the copy at /portfolio/projects.yaml is a stale
// leftover). It does embed every project plus the config in the portfolio page as
// `window.PROJECTS_DATA = {...};`, so we read that. If projection ever writes a
// /portfolio/projects.json, that gets used first.

const PORTFOLIO_JSON_URL = "/portfolio/projects.json";
const PORTFOLIO_PAGE_URL = "/portfolio/";
const FEED_URL = "/blog/feeds/all.atom.xml";

// ---------- pure helpers (exposed on window.home for tests) ----------

// Only tagged entries count as videos. Several projects link to a YouTube demo
// (Tetris, 2048, ...) and those are projects.
const isVideo = (p) => (p.tags || []).includes("video");

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

function newest(items, dateOf) {
  return items.reduce((best, x) => (!best || dateOf(x) > dateOf(best) ? x : best), null);
}

function shortDate(iso) {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  if (isNaN(d)) return "";
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

function parseFeed(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  return [...doc.querySelectorAll("entry")].map((e) => ({
    title: e.querySelector("title")?.textContent.trim() || "Untitled",
    link:
      e.querySelector('link[rel="alternate"]')?.getAttribute("href") ||
      e.querySelector("link")?.getAttribute("href") ||
      "/blog/",
    date: e.querySelector("published")?.textContent || e.querySelector("updated")?.textContent || "",
  }));
}

// ---------- rendering ----------

function setLatest(kind, item) {
  const el = document.querySelector(`[data-latest="${kind}"]`);
  if (!el || !item) return;
  const a = document.createElement("a");
  a.href = item.link;
  a.textContent = item.title;
  el.replaceChildren(a);
  if (item.date) {
    const t = document.createElement("time");
    t.dateTime = item.date;
    t.textContent = shortDate(item.date);
    el.append(t);
  }
}

function setCount(kind, n) {
  const el = document.querySelector(`[data-count="${kind}"]`);
  if (el) el.textContent = String(n);
}

function renderProjects(data) {
  const all = data.projects || [];
  const videos = all.filter(isVideo);
  const projects = all.filter((p) => !isVideo(p));
  const asItem = (p) => p && { title: p.title, link: p.pageLink, date: p.creationDate };

  setCount("projects", projects.length);
  setLatest("projects", asItem(newest(projects, (p) => p.creationDate)));

  // No videos tagged yet: leave the row out rather than show an empty section.
  document.querySelector(".kind-videos").hidden = videos.length === 0;
  setCount("videos", videos.length);
  setLatest("videos", asItem(newest(videos, (p) => p.creationDate)));
}

function renderWriting(posts) {
  setCount("writing", posts.length);
  setLatest("writing", newest(posts, (p) => p.date));
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

  load(Math.floor(Math.random() * backgrounds.length));
}

// ---------- boot ----------

async function main() {
  const [portfolioRes, feedRes] = await Promise.allSettled([
    loadPortfolio(),
    fetch(FEED_URL).then((r) => (r.ok ? r.text() : Promise.reject(r.status))),
  ]);

  if (portfolioRes.status === "fulfilled") {
    const data = portfolioRes.value;
    renderProjects(data);
    setupBackground(backgroundsFrom(data));
  } else {
    console.warn("Could not load portfolio data:", portfolioRes.reason);
  }

  if (feedRes.status === "fulfilled") {
    renderWriting(parseFeed(feedRes.value));
  } else {
    console.warn("Could not load the blog feed:", feedRes.reason);
  }
}

window.home = { isVideo, extractProjectsData, normalizeUrl, backgroundsFrom, titleFromUrl, newest, shortDate, parseFeed };
main();
