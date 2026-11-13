#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
三更灯 · 无相客栈 —— P6 云端润色代理（零依赖，仅标准库）

为什么需要它：游戏是纯静态站，浏览器不能持有 API Key。本服务在服务端持有
MODELSCOPE_API_KEY，接收前端一句 NPC 台词的润色请求，调用魔搭 API-Inference
（免费额度：2000 次/天，单模型 500/天），按「快→强」备份链自动降级，只返回
改写后的那一句台词。任何失败都返回 {"text": null}，前端 (js/llm.js) 静默回退原文。

与判定层完全解耦：只润色措辞/语气，绝不改动事实、数字、物品、人名、时间、地点。

环境变量：
  MODELSCOPE_API_KEY  必填，魔搭访问令牌（需「大模型推理」权限）
  POLISH_MODELS       可选，逗号分隔的备份链（默认 Qwen 四档）
  ALLOW_ORIGINS       可选，CORS 允许来源（默认 *；上线建议设为游戏域名）
  PER_MODEL_TIMEOUT   可选，单模型超时秒（默认 2.4）
  TOTAL_DEADLINE      可选，整次请求总预算秒（默认 4.6）
  PORT                可选，监听端口（默认 7860）

用法：
  MODELSCOPE_API_KEY=xxx python proxy/app.py
  或像 ModelScope 创空间那样：PORT=7860 MODELSCOPE_API_KEY=xxx python proxy/app.py
"""
import json
import os
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

API = "https://api-inference.modelscope.cn/v1/chat/completions"
KEY = os.environ.get("MODELSCOPE_API_KEY", "").strip()

# 备份链：turbo 位 → plus 位 → max 位 → 兜底位（qwen-vl 无纯文本对话版，用 27B 补第④位）
DEFAULT_CHAIN = ("Qwen/Qwen3.8-Flash-Next,Qwen/Qwen3.5-122B-A10B,"
                 "Qwen/Qwen3.5-397B-A17B,Qwen/Qwen3.5-27B")
CHAIN = [m.strip() for m in os.environ.get("POLISH_MODELS", DEFAULT_CHAIN).split(",") if m.strip()]

PER_MODEL_TIMEOUT = float(os.environ.get("PER_MODEL_TIMEOUT", "2.4"))
TOTAL_DEADLINE = float(os.environ.get("TOTAL_DEADLINE", "4.6"))
MAX_INPUT = 300
ALLOW = os.environ.get("ALLOW_ORIGINS", "*").strip()

SYSTEM = (
    "你是中式古风客栈里的台词润色器。用户给你一句 NPC 的原话，你要在不改变任何事实的"
    "前提下，把措辞与语气改得更贴合这个人物和他的当下情绪。硬性要求："
    "①绝不增删或改变任何事实、数字、物品、人名、时间、地点；"
    "②只输出改写后的那一句台词，不加引号、不加解释、不分行；"
    "③长度与原句相近（不超过 1.5 倍）；④原句若已够好，就基本保持原样。"
)


def _state_text(state):
    if not state:
        return "如常"
    if isinstance(state, str):
        return state
    if isinstance(state, dict):
        parts = ["%s=%s" % (k, v) for k, v in state.items() if v not in (None, "")]
        return "、".join(parts) or "如常"
    return str(state)


def _body(model, persona, state, action, base):
    user = "人物：%s\n当下状态：%s\n动作：%s\n原话：%s" % (
        persona or "客人", _state_text(state), action or "开口", base)
    b = {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
        "max_tokens": 160,
        "temperature": 0.7,
    }
    # 仅 Qwen 系列关思考：更快、输出更干净（实测 3.3s → 1.2s）
    if model.startswith("Qwen/"):
        b["chat_template_kwargs"] = {"enable_thinking": False}
    return b


def _clean(txt):
    if not txt:
        return None
    s = txt.strip().strip('"\'“”‘’「」『』').strip()
    if not s:
        return None
    s = s.splitlines()[0].strip()
    return s or None


def _call(model, persona, state, action, base, timeout):
    data = json.dumps(_body(model, persona, state, action, base)).encode("utf-8")
    req = urllib.request.Request(API, data=data, method="POST")
    req.add_header("Authorization", "Bearer " + KEY)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            j = json.loads(r.read().decode("utf-8", "replace"))
        msg = (j.get("choices") or [{}])[0].get("message") or {}
        return _clean(msg.get("content"))
    except Exception:
        return None


def polish(base, persona, state, action):
    """返回 (text, model)；全链失败返回 (None, None)。"""
    t0 = time.monotonic()
    for m in CHAIN:
        left = TOTAL_DEADLINE - (time.monotonic() - t0)
        if left <= 0.15:
            break
        txt = _call(m, persona, state, action, base, min(PER_MODEL_TIMEOUT, left))
        # 防跑偏：长度必须在原句 0.4~1.8 倍之间，否则视为无效（避免改坏事实/截断）
        if txt and 0.4 * len(base) <= len(txt) <= 1.8 * len(base):
            return txt, m
    return None, None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", ALLOW if ALLOW else "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self._cors()
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            self._json({"ok": True, "key": bool(KEY), "chain": CHAIN,
                        "per_model_timeout": PER_MODEL_TIMEOUT, "total_deadline": TOTAL_DEADLINE})
        else:
            self._json({"ok": False, "reason": "not_found"}, 404)

    def do_POST(self):
        if not self.path.startswith("/api/polish"):
            return self._json({"text": None, "reason": "not_found"}, 404)
        if not KEY:
            return self._json({"text": None, "reason": "no_key"})
        try:
            n = int(self.headers.get("Content-Length", "0") or 0)
            raw = self.rfile.read(n) if n else b"{}"
            body = json.loads(raw.decode("utf-8", "replace"))
        except Exception:
            return self._json({"text": None, "reason": "bad_json"})
        base = str(body.get("baseText") or "").strip()[:MAX_INPUT]
        if not base:
            return self._json({"text": None, "reason": "empty"})
        txt, m = polish(base, str(body.get("persona") or "").strip(), body.get("state"), body.get("action"))
        if txt:
            return self._json({"text": txt, "model": m})
        return self._json({"text": None, "reason": "all_failed"})

    def log_message(self, *a):
        pass  # 静默，避免刷屏


def main():
    port = int(os.environ.get("PORT", "7860"))
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("sandeng llm-proxy on :%d  key=%s  chain=%s" % (port, bool(KEY), CHAIN), flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
