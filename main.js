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

// Backgrounds on this site load by path, so the iframe is same-origin with the page in production
// (and through serve.py's proxy locally). Same origin is what lets us reach into its document.
const SITE = "https://quasarbright.github.io";
function sameOriginUrl(url) {
  return url.startsWith(SITE + "/") ? url.slice(SITE.length) : url;
}

function titleFromUrl(url) {
  const seg = normalizeUrl(url).split("/").pop() || "Background";
  return seg.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// ---------- background ----------

// Fisher–Yates, on a copy.
function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setupBackground(allBackgrounds) {
  const iframe = document.getElementById("background");
  const credit = document.getElementById("credit");
  const link = document.getElementById("credit-link");
  const shuffle = document.getElementById("shuffle");
  if (!allBackgrounds.length) return;

  // Shuffle the list once per visit; the button then walks through it in that order,
  // so every background shows once before any repeats. ?bg=<text> moves a match to the front.
  const backgrounds = shuffled(allBackgrounds);
  const want = new URLSearchParams(location.search).get("bg");
  const picked = want ? backgrounds.findIndex((b) => b.url.includes(want)) : -1;
  if (picked > 0) backgrounds.unshift(...backgrounds.splice(picked, 1));

  let current = -1;
  function load(i) {
    current = i;
    const bg = backgrounds[i];
    const sep = bg.url.includes("?") ? "&" : "?";
    iframe.classList.remove("ready");
    iframe.src = sameOriginUrl(/[?&]background\b/.test(bg.url) ? bg.url : bg.url + sep + "background=true");
    link.textContent = bg.project?.title || titleFromUrl(bg.url);
    link.href = bg.project?.pageLink || bg.url.replace(/[?&]background(=[^&]*)?/, "");
    credit.hidden = false;
    shuffle.hidden = backgrounds.length < 2;
  }
  iframe.addEventListener("load", () => iframe.classList.add("ready"));

  shuffle.addEventListener("click", () => load((current + 1) % backgrounds.length));

  // Everywhere except the links and the credit chip, the page lets the pointer through
  // (pointer-events: none), so the sketch gets real events. Over those elements the page
  // gets them instead; this re-dispatches the move inside the iframe at the same spot.
  document.addEventListener("pointermove", (e) => forwardMove(iframe, e));

  load(0);
}

// Dispatch a synthetic pointermove + mousemove on whatever is under (x, y) in the iframe.
// Sketches read clientX/clientY from the event, so they follow the cursor as if it were theirs.
// Uses the iframe's own event constructors so the events belong to its window.
function forwardMove(iframe, e) {
  let win, doc;
  try {
    win = iframe.contentWindow;
    doc = iframe.contentDocument; // null or throws when cross-origin
  } catch {
    return;
  }
  if (!win || !doc) return;
  const r = iframe.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const target = doc.elementFromPoint(x, y) || doc.body || doc.documentElement;
  if (!target) return;
  const init = {
    bubbles: true, cancelable: true, composed: true, view: win,
    clientX: x, clientY: y, screenX: e.screenX, screenY: e.screenY,
    movementX: e.movementX, movementY: e.movementY, buttons: e.buttons,
  };
  target.dispatchEvent(new win.PointerEvent("pointermove", {
    ...init, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary,
  }));
  target.dispatchEvent(new win.MouseEvent("mousemove", init));
}

// ---------- boot ----------

async function main() {
  try {
    setupBackground(backgroundsFrom(await loadPortfolio()));
  } catch (err) {
    console.warn("Could not load the portfolio's backgrounds:", err);
  }
}

window.home = { extractProjectsData, normalizeUrl, sameOriginUrl, backgroundsFrom, titleFromUrl, shuffled };
main();
