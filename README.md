# home

Mike Delmonaco's home page, served at `https://quasarbright.github.io/home/`.

A background project from the portfolio runs full screen behind the page, with a link to whichever one is showing. Over it are a photo, a name, and an index of projects, videos, writing, and art. Each line shows a count and the newest item.

There's no data in this repo. At load the page reads:

- **Projects, videos, backgrounds** from the deployed portfolio. Projection embeds every project and the config in `/portfolio/` as `window.PROJECTS_DATA`, and the page parses that. If `/portfolio/projects.json` ever exists, it's used instead. Videos are projects tagged `video`. The Videos line stays hidden until one exists.
- **Writing** from the blog's Atom feed at `/blog/feeds/all.atom.xml`.
- **Art** is a link to https://x.com/QuasarBright for now.

Backgrounds are projects with a `background:` field if any have one, otherwise `dynamicBackgrounds` from the portfolio config.

## Run locally

```bash
python3 serve.py
```

Then open http://localhost:8642/home/. The server serves this repo at `/home/` and proxies `/portfolio/` and `/blog/` to the live site, so the page sees the same paths it will in production.
