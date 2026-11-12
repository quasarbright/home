"""Local dev server for the home page.

Serves this repo at /home/ and proxies /portfolio/ and /blog/ to the live site,
so the page reads real data the same way it will on quasarbright.github.io.

    python3 serve.py          # http://localhost:8642/home/
"""
import http.server
import os
import sys
import urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
ROOT = os.path.dirname(os.path.abspath(__file__))
LIVE = "https://quasarbright.github.io"
PROXIED = ("/portfolio/", "/blog/")


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
        if self.path.startswith(PROXIED):
            return self.proxy()
        if not self.path.startswith("/home/"):
            self.send_error(404)
            return
        super().do_GET()

    def proxy(self):
        try:
            with urllib.request.urlopen(LIVE + self.path, timeout=15) as r:
                body = r.read()
                self.send_response(r.status)
                self.send_header("Content-Type", r.headers.get("Content-Type", "application/octet-stream"))
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_error(e.code)
        except Exception as e:  # network down, timeout
            self.send_error(502, str(e))


if __name__ == "__main__":
    print(f"http://localhost:{PORT}/home/")
    http.server.ThreadingHTTPServer(("", PORT), Handler).serve_forever()
