# home

Mike Delmonaco's home page, served at `https://quasarbright.github.io/home/`.

A background project from the portfolio runs full screen behind the page, with a chip naming whichever one is showing and a Shuffle button. Over it are a photo, a name, and links to coding projects, blog posts, educational videos, music, and vector art (X for now, a gallery later). A soft dark halo sits behind each block of content so bright backgrounds don't wash out the text.

The background list is the only data the page reads, and it comes from the deployed portfolio. Projection embeds every project and the config in `/portfolio/` as `window.PROJECTS_DATA`, and the page parses that. If `/portfolio/projects.json` ever exists, it's used instead. Backgrounds are projects with a `background:` field if any have one, otherwise `dynamicBackgrounds` from the portfolio config.

`?bg=<text>` picks the first background whose URL contains `<text>`, for checking contrast (`?bg=image-column-sort` is the brightest).

## Run locally

```bash
python3 serve.py
```

Then open http://localhost:8642/home/. The server serves this repo at `/home/` and proxies every other path to the live site, so the page sees the same paths it will in production. That includes the background sketches, which keeps them same-origin with the page.

## Mouse over the links

The page has `pointer-events: none` everywhere except the links and the credit chip, so the background gets real mouse events nearly everywhere. Over a link the page gets the event instead, and `forwardMove` in `main.js` dispatches a synthetic `pointermove` and `mousemove` at the same spot inside the iframe. That only works because the iframe is same-origin, which is why backgrounds load by path (`/sketches/fireflies/?background`) rather than by full URL.
