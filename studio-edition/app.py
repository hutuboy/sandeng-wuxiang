"""三更灯 · 无相客栈｜ModelScope Studio 线上增强后端。

职责：
1. 托管本地可玩的静态游戏（index.html / assets / js）
2. 只在线上给 index.html 注入云开关；本地 file:// 不注入，云按钮隐藏且零请求
3. 提供免注册云存档 / 排行榜：HttpOnly Cookie 匿名身份 + /mnt/workspace 持久化

设计原则：本地离线可玩，线上可选增强。token 不进入本文件；云端润色仍由
独立代理持有 Key，前端只在 https 下按需调用。
"""
import json
import os
import re
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "7860"))
CLOUD_FILE = Path(os.environ.get("CLOUD_FILE", "/mnt/workspace/sandeng-cloud/cloud.json"))
COOKIE = "sd_uid"
UID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MAX_BODY = 4 * 1024 * 1024
_lock = threading.Lock()

# 侠名词库与前端 js/ms-cloud.js 保持一致；只由服务端 uid 派生，前端不传名字。
NAME_ADJ = ["青竹", "孤鹤", "霜刃", "墨鲤", "寒鸦", "松风", "疏影", "赤羽", "白砚", "乌木", "流萤", "断桥"]
NAME_NOUN = ["更夫", "游侠", "书生", "刀客", "道人", "伶人", "货郎", "算师", "守夜人", "镖师", "掌柜", "客卿"]

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".md": "text/markdown; charset=utf-8",
}


def _fnv1a(s: str) -> int:
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def _username(uid: str) -> str:
    h = _fnv1a(uid or "")
    return (NAME_ADJ[h % len(NAME_ADJ)] + "·" + NAME_NOUN[(h >> 8) % len(NAME_NOUN)]
            + "-" + ("%04x" % (h & 0xFFFF)))


def _new_uid() -> str:
    return "sd_" + secrets.token_hex(10)


def _cookie_uid(handler) -> str:
    raw = handler.headers.get("Cookie", "") or ""
    for part in raw.split(";"):
        k, sep, v = part.strip().partition("=")
        if sep and k == COOKIE:
            v = v.strip().strip('"')
            return v if UID_RE.match(v) else ""
    return ""


def _set_cookie(handler, uid: str):
    handler.send_header("Set-Cookie",
                        "%s=%s; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly" % (COOKIE, uid))


def _uid_and_cookie(handler):
    uid = _cookie_uid(handler)
    if uid:
        return uid, None
    uid = _new_uid()
    return uid, uid


def _read_cloud() -> dict:
    try:
        data = json.loads(CLOUD_FILE.read_text(encoding="utf-8"))
        if data.get("v") == 1 and isinstance(data.get("users"), dict) and isinstance(data.get("scores"), dict):
            return data
    except Exception:
        pass
    return {"v": 1, "users": {}, "scores": {}}


def _write_cloud(data: dict):
    CLOUD_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = CLOUD_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(str(tmp), str(CLOUD_FILE))


def _text(v, limit=80) -> str:
    return str(v or "")[:limit]


def _num(v, lo, hi, default=0):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    if n != n or n in (float("inf"), float("-inf")):
        return default
    return max(lo, min(hi, n))


def _clean_state(raw) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    session = raw.get("session") if isinstance(raw.get("session"), dict) else {}
    game = raw.get("game") if isinstance(raw.get("game"), dict) else {}
    act = _text(raw.get("act"), 16) or "ask"
    if act not in ("lamp", "ask", "deduce", "accuse"):
        act = "ask"
    return {
        "v": 2,
        "session": session,
        "game": game,
        "selected": raw.get("selected") if isinstance(raw.get("selected"), (str, int)) else None,
        "tone": _text(raw.get("tone"), 16) or "warm",
        "ended": bool(raw.get("ended")),
        "act": act,
    }


def _clean_score(raw) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    nights = raw.get("nights") if isinstance(raw.get("nights"), list) else []
    nights = [n for n in nights[:3] if isinstance(n, dict)]
    return {
        "correct": int(_num(raw.get("correct"), 0, 3)),
        "total_score": int(_num(raw.get("total_score"), 0, 100000)),
        "lamps_left": int(_num(raw.get("lamps_left"), 0, 12)),
        "seed": _text(raw.get("seed"), 40),
        "difficulty": _text(raw.get("difficulty"), 20) or "basic",
        "chain_count": int(_num(raw.get("chain_count"), 0, 99)),
        "nights": nights,
    }


def _save_for(uid: str, raw) -> dict:
    state = _clean_state(raw)
    with _lock:
        data = _read_cloud()
        rec = data["users"].get(uid) or {}
        name = rec.get("name") or _username(uid)
        data["users"][uid] = {
            "name": name,
            "state": state,
            "updated_at": int(time.time()),
        }
        _write_cloud(data)
    return {"name": name, "state": state}


def _load_for(uid: str) -> dict:
    with _lock:
        rec = _read_cloud()["users"].get(uid) or {}
    return {
        "ok": True,
        "name": rec.get("name") or _username(uid),
        "state": rec.get("state"),
        "updated_at": rec.get("updated_at", 0),
    }


def _submit_for(uid: str, raw) -> dict:
    incoming = _clean_score(raw)
    with _lock:
        data = _read_cloud()
        name = (data["users"].get(uid) or {}).get("name") or _username(uid)
        old = data["scores"].get(uid)
        if not old or incoming["total_score"] > int(old.get("total_score", -1)):
            row = dict(incoming)
            row["name"] = name
            row["created_at"] = int(time.time())
            data["scores"][uid] = row
            data["users"].setdefault(uid, {"name": name, "state": None, "updated_at": int(time.time())})
            _write_cloud(data)
        else:
            row = old
    return {"ok": True, "name": name, "total_score": int(row.get("total_score", 0))}


def _leaderboard(me_uid: str) -> dict:
    with _lock:
        scores = _read_cloud()["scores"]
    rows = []
    for uid, rec in scores.items():
        row = dict(rec)
        row["me"] = (uid == me_uid)
        rows.append(row)
    rows.sort(key=lambda r: (-int(r.get("total_score", 0)),
                             -int(r.get("correct", 0)),
                             int(r.get("created_at", 0)),
                             str(r.get("name", ""))))
    for i, row in enumerate(rows):
        row["rank"] = i + 1
    mine = next((r for r in rows if r.get("me")), None)
    return {"ok": True, "rows": rows[:50], "me": mine, "total": len(rows), "online": True}


def inject_config(html: bytes) -> bytes:
    """线上注入云开关；本地静态文件不经过这里，云按钮保持隐藏。"""
    tag = (b"<script>window.__SANDENG_CLOUD_ENABLED__=true;"
           b"window.__SANDENG_CLOUD_BASE__='/api/cloud';</script>")
    if b"</head>" in html:
        return html.replace(b"</head>", tag + b"</head>", 1)
    return tag + html


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _json(self, obj, code=200, extra=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or []):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _bytes(self, body, ctype):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        try:
            n = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            return None
        if n < 0 or n > MAX_BODY:
            return None
        try:
            return json.loads(self.rfile.read(n).decode("utf-8", "replace"))
        except Exception:
            return None

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path.startswith("/health"):
            return self._json({"ok": True, "cloud": {"enabled": True, "online": True,
                                                     "file": str(CLOUD_FILE)}})
        if path == "/api/cloud/me":
            uid, new = _uid_and_cookie(self)
            extra = [("Set-Cookie", "%s=%s; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly" % (COOKIE, new))] if new else None
            return self._json({"ok": True, "uid": uid, "name": _username(uid), "new": bool(new)}, extra=extra)
        if path == "/api/cloud/load":
            uid = _cookie_uid(self)
            if not uid:
                return self._json({"ok": True, "state": None, "name": "", "updated_at": 0})
            return self._json(_load_for(uid))
        if path == "/api/cloud/leaderboard":
            uid, new = _uid_and_cookie(self)
            extra = [("Set-Cookie", "%s=%s; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly" % (COOKIE, new))] if new else None
            return self._json(_leaderboard(uid), extra=extra)
        if path.startswith("/api/"):
            return self._json({"ok": False, "reason": "not_found"}, 404)
        if path in ("/", ""):
            path = "/index.html"
        target = ROOT / path.lstrip("/")
        try:
            target.resolve().relative_to(ROOT.resolve())
        except ValueError:
            return self._json({"ok": False, "reason": "forbidden"}, 403)
        if not target.is_file() or target.suffix not in MIME:
            return self._json({"ok": False, "reason": "not_found"}, 404)
        data = target.read_bytes()
        if target.suffix == ".html":
            data = inject_config(data)
        self._bytes(data, MIME[target.suffix])

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/cloud/save":
            body = self._body()
            if body is None:
                return self._json({"ok": False, "reason": "bad_json"}, 400)
            uid, new = _uid_and_cookie(self)
            rec = _save_for(uid, body.get("state"))
            extra = [("Set-Cookie", "%s=%s; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly" % (COOKIE, new))] if new else None
            return self._json({"ok": True, "saved": True, "name": rec["name"], "uid": uid}, extra=extra)
        if path == "/api/cloud/submit":
            body = self._body()
            if body is None:
                return self._json({"ok": False, "reason": "bad_json"}, 400)
            uid, new = _uid_and_cookie(self)
            rec = _submit_for(uid, body)
            extra = [("Set-Cookie", "%s=%s; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly" % (COOKIE, new))] if new else None
            return self._json(rec, extra=extra)
        return self._json({"ok": False, "reason": "not_found"}, 404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args):
        pass


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, BrokenPipeError, ConnectionAbortedError)):
            return
        super().handle_error(request, client_address)


def main():
    Server(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
