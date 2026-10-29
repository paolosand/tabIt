"""Local-only guard for the helper API.

The helper listens on 127.0.0.1, but a browser page can still reach it: by
sending CORS-simple requests (e.g. a multipart POST) or via DNS rebinding.
This pure-ASGI middleware rejects both before any routing, CORS handling, or
body reading happens:

* the Host header must be a loopback name (defeats DNS rebinding);
* a request that carries an Origin and is not GET/HEAD/OPTIONS (websocket
  handshakes count as unsafe) must come from
  a Chrome extension or the dev web app (defeats cross-site writes).
"""
import re

_HOST_RE = re.compile(r"^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$")
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_EXTENSION_PREFIX = "chrome-extension://"
_DEV_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}


def host_is_allowed(host: str | None) -> bool:
    return bool(host) and _HOST_RE.fullmatch(host.lower()) is not None


def origin_is_allowed(origin: str | None, method: str) -> bool:
    if origin is None or method.upper() in _SAFE_METHODS:
        return True
    return origin.startswith(_EXTENSION_PREFIX) or origin in _DEV_ORIGINS


class LocalGuardMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        host = origin = None
        for name, value in scope.get("headers", []):
            if name == b"host" and host is None:
                host = value.decode("latin-1")
            elif name == b"origin" and origin is None:
                origin = value.decode("latin-1")

        # A websocket handshake is a GET, but it is a cross-site write channel:
        # hold it to the same Origin rule as an unsafe method.
        method = scope.get("method", "GET") if scope["type"] == "http" else "POST"
        if host_is_allowed(host) and origin_is_allowed(origin, method):
            await self.app(scope, receive, send)
            return

        if scope["type"] == "websocket":
            await receive()  # the connect message
            await send({"type": "websocket.close", "code": 1008})
            return
        body = b'{"detail":"forbidden"}'
        await send({"type": "http.response.start", "status": 403, "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode()),
        ]})
        await send({"type": "http.response.body", "body": body})
