"""Local dev server for the home page.

Serves this repo at /home/ and proxies every other path to the live site, so the page
reads real data and loads background sketches from the same origin, as it will on
quasarbright.github.io. (Same origin is what lets the page forward mouse moves into
the background iframe.)

    python3 serve.py          # http://localhost:8642/home/
"""
import http.server
import os
import sys
import urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
ROOT = os.path.dirname(os.path.abspath(__file__))
LIVE = "https://quasarbright.github.io"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def translate_path(self, path):
        # /home/x -> <repo>/x
        if path.startswith("/home/"):
            path = path[len("/home"):]
        return super().translate_path(path)

    def do_GET(self):
        if self.path in ("/", "/home"):
            self.send_response(302)
            self.send_header("Location", "/home/")
            self.end_headers()
            return
        if not self.path.startswith("/home/"):
            return self.proxy()
        super().do_GET()

    def proxy(self):
        try:
            with OPENER.open(LIVE + self.path, timeout=15) as r:
                body = r.read()
                self.send_response(r.status)
                self.send_header("Content-Type", r.headers.get("Content-Type", "application/octet-stream"))
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 307, 308) and e.headers.get("Location"):
                # Pass redirects to the browser (e.g. /p5js/boids -> /p5js/boids/) so relative
                # asset paths resolve against the right URL. Keep them on this server.
                self.send_response(e.code)
                self.send_header("Location", e.headers["Location"].replace(LIVE, ""))
                self.end_headers()
            else:
                self.send_error(e.code)
        except Exception as e:  # network down, timeout
            self.send_error(502, str(e))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


if __name__ == "__main__":
    print(f"http://localhost:{PORT}/home/")
    http.server.ThreadingHTTPServer(("", PORT), Handler).serve_forever()
