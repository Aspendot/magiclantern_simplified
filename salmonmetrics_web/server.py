from __future__ import annotations

import json
import mimetypes
import os
import posixpath
import socket
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

try:
    import requests
except ImportError:  # The server still runs without third-party packages.
    requests = None


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"
STATE_FILE = DATA_DIR / "last_shift.json"

DEFAULT_GOOGLE_SHEET_URL = (
    "https://script.google.com/macros/s/"
    "AKfycbyoZQBC6iIbvqSR79O_2zLY6BNx-kprljWWfBhxKH5pJM1wFWIRUWY0hm3YavNtF3q9/exec"
)

GOOGLE_SHEET_URL = os.environ.get("SALMONMETRICS_SHEET_URL", DEFAULT_GOOGLE_SHEET_URL)
ACCESS_TOKEN = os.environ.get("SALMONMETRICS_ACCESS_TOKEN", "")
HOST = os.environ.get("SALMONMETRICS_HOST", "0.0.0.0")
PORT = int(os.environ.get("SALMONMETRICS_PORT", "8765"))

DEFAULT_SHIFT_CONFIG = {
    "start_time": "",
    "end_time": "",
    "stage": "アラマキ砦",
    "weapons": ["", "", "", ""],
    "expire_at": "",
    "last_setup_at": "",
}

JAPANESE_FIELDS = {
    "datetime": "日時",
    "user": "ユーザー名",
    "stage": "ステージ",
    "weapons": "ブキ",
    "total_eggs": "全体の納品数",
    "my_eggs": "自分の納品数",
    "my_kills": "自分の処理数",
    "p2_kills": "2P処理数",
    "p3_kills": "3P処理数",
    "p4_kills": "4P処理数",
    "total_kills": "全体の合計処理数",
    "total_red": "全体赤イクラ",
    "my_red": "個人赤イクラ",
    "notes": "備考",
    "mode": "記録モード",
    "play_style": "プレイスタイル",
    "day_night": "昼夜区分",
}

LEGACY_APPEND_ORDER = [
    JAPANESE_FIELDS["datetime"], JAPANESE_FIELDS["user"], JAPANESE_FIELDS["stage"],
    JAPANESE_FIELDS["total_eggs"], JAPANESE_FIELDS["my_eggs"], JAPANESE_FIELDS["my_kills"],
    JAPANESE_FIELDS["p2_kills"], JAPANESE_FIELDS["p3_kills"], JAPANESE_FIELDS["p4_kills"],
    JAPANESE_FIELDS["total_kills"], JAPANESE_FIELDS["total_red"], JAPANESE_FIELDS["my_red"],
    JAPANESE_FIELDS["notes"], "Dr", "BSKr", "OKr", "DPK", JAPANESE_FIELDS["mode"],
    "W1", "W2", "W3", "W4", "W5",
]

WEAPON_COLUMN_APPEND_ORDER = [
    JAPANESE_FIELDS["datetime"], JAPANESE_FIELDS["user"], JAPANESE_FIELDS["stage"],
    JAPANESE_FIELDS["weapons"], JAPANESE_FIELDS["total_eggs"], JAPANESE_FIELDS["my_eggs"],
    JAPANESE_FIELDS["my_kills"], JAPANESE_FIELDS["p2_kills"], JAPANESE_FIELDS["p3_kills"],
    JAPANESE_FIELDS["p4_kills"], JAPANESE_FIELDS["total_kills"], JAPANESE_FIELDS["total_red"],
    JAPANESE_FIELDS["my_red"], JAPANESE_FIELDS["notes"], "Dr", "BSKr", "OKr", "DPK",
    JAPANESE_FIELDS["mode"], "W1", "W2", "W3", "W4", "W5",
]

DAY_ONLY = "昼のみ"
NIGHT_INCLUDED = "夜あり"
DAY_NIGHT_NOTE_PREFIXES = ("[昼のみ]", "[夜あり]")


mimetypes.add_type("application/javascript; charset=utf-8", ".js")
mimetypes.add_type("text/css; charset=utf-8", ".css")
mimetypes.add_type("application/manifest+json; charset=utf-8", ".webmanifest")
mimetypes.add_type("image/svg+xml; charset=utf-8", ".svg")


def as_float(value) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    if not text:
        return 0.0
    return float(text)


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None

    normalized = text.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized).replace(tzinfo=None)
    except ValueError:
        pass

    for fmt in (
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y/%m/%d",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def sheet_datetime(value: str | None) -> str:
    if not value:
        return datetime.now().strftime("%Y-%m-%d %H:%M")
    parsed = parse_datetime(value)
    if parsed is None:
        raise ValueError("打刻時刻は YYYY/MM/DD HH:MM または日付入力で指定してください")
    return parsed.strftime("%Y-%m-%d %H:%M")


def normalize_day_night(value: str | None) -> str:
    return NIGHT_INCLUDED if "夜" in str(value or "") else DAY_ONLY


def notes_with_day_night(day_night: str | None, notes: str | None) -> str:
    clean_notes = str(notes or "").strip()
    for prefix in DAY_NIGHT_NOTE_PREFIXES:
        if clean_notes.startswith(prefix):
            clean_notes = clean_notes[len(prefix):].strip()
            break
    condition = normalize_day_night(day_night)
    return f"[{condition}]{f' {clean_notes}' if clean_notes else ''}"


def format_weapons(value: object) -> str:
    if not isinstance(value, list):
        return ""
    return " / ".join(str(item or "").strip() for item in value[:4] if str(item or "").strip())


def legacy_append_payload(payload: dict | None) -> dict | None:
    if not payload:
        return payload
    shifted = payload.copy()
    for index in range(3, len(LEGACY_APPEND_ORDER)):
        shifted[LEGACY_APPEND_ORDER[index]] = payload.get(WEAPON_COLUMN_APPEND_ORDER[index], "")
    return shifted


def load_shift_config() -> dict:
    if not STATE_FILE.exists():
        return DEFAULT_SHIFT_CONFIG.copy()
    try:
        loaded = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return DEFAULT_SHIFT_CONFIG.copy()
    config = DEFAULT_SHIFT_CONFIG.copy()
    config.update({k: loaded.get(k, v) for k, v in DEFAULT_SHIFT_CONFIG.items()})
    weapons = config.get("weapons")
    if not isinstance(weapons, list):
        config["weapons"] = ["", "", "", ""]
    config["weapons"] = (config["weapons"] + ["", "", "", ""])[:4]
    return config


def save_shift_config(incoming: dict) -> dict:
    config = load_shift_config()
    for key in ("start_time", "end_time", "stage", "expire_at"):
        if key in incoming:
            config[key] = str(incoming.get(key) or "")
    if "weapons" in incoming and isinstance(incoming["weapons"], list):
        config["weapons"] = [str(item or "") for item in incoming["weapons"][:4]]
        config["weapons"] = (config["weapons"] + ["", "", "", ""])[:4]
    if not config.get("expire_at"):
        config["expire_at"] = config.get("end_time", "")
    config["last_setup_at"] = datetime.now().isoformat(timespec="seconds")
    DATA_DIR.mkdir(exist_ok=True)
    STATE_FILE.write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return config


def build_sheet_payload(body: dict, shift_config: dict) -> dict:
    mode = str(body.get("mode", "STANDARD")).upper()
    if mode not in {"STANDARD", "CONTEST"}:
        raise ValueError("mode must be STANDARD or CONTEST")

    user = str(body.get("userName") or "").strip()
    if not user or user in {"選択してください", "すべて"}:
        raise ValueError("有効なユーザー名を入力してください")

    counts = body.get("counts") or {}
    total_eggs = as_float(counts.get("totalEggs"))
    my_eggs = as_float(counts.get("myEggs"))
    my_kills = as_float(counts.get("myKills"))
    p2_kills = as_float(counts.get("p2Kills"))
    p3_kills = as_float(counts.get("p3Kills"))
    p4_kills = as_float(counts.get("p4Kills"))
    total_kills = my_kills + p2_kills + p3_kills + p4_kills
    total_red = as_float(counts.get("totalRed"))
    my_red = as_float(counts.get("myRed"))

    dr = my_eggs / total_eggs if total_eggs > 0 else 0
    bskr = my_kills / total_kills if total_kills > 0 else 0
    okr = my_red / total_red if total_red > 0 else 0
    day_night = normalize_day_night(body.get("dayNight"))
    notes = str(body.get("notes") or "")
    stage = (
        str(body.get("round") or "第1回")
        if mode == "CONTEST"
        else str(body.get("stage") or shift_config.get("stage") or "")
    )
    weapons = format_weapons(body.get("weapons")) or format_weapons(shift_config.get("weapons"))

    payload = {
        JAPANESE_FIELDS["datetime"]: sheet_datetime(body.get("stampedAt")),
        JAPANESE_FIELDS["user"]: user,
        JAPANESE_FIELDS["stage"]: stage,
        JAPANESE_FIELDS["weapons"]: weapons,
        JAPANESE_FIELDS["total_eggs"]: total_eggs,
        JAPANESE_FIELDS["my_eggs"]: my_eggs,
        JAPANESE_FIELDS["my_kills"]: my_kills,
        JAPANESE_FIELDS["p2_kills"]: p2_kills,
        JAPANESE_FIELDS["p3_kills"]: p3_kills,
        JAPANESE_FIELDS["p4_kills"]: p4_kills,
        JAPANESE_FIELDS["total_kills"]: total_kills,
        JAPANESE_FIELDS["total_red"]: total_red,
        JAPANESE_FIELDS["my_red"]: my_red,
        JAPANESE_FIELDS["notes"]: notes_with_day_night(day_night, notes)
        if mode == "STANDARD"
        else notes,
        "Dr": dr,
        "BSKr": bskr,
        "OKr": okr,
        "DPK": dr + bskr,
        JAPANESE_FIELDS["mode"]: mode,
    }

    play_style = str(body.get("playStyle") or "").strip()
    if play_style and mode == "STANDARD":
        payload[JAPANESE_FIELDS["play_style"]] = play_style

    if mode == "STANDARD":
        payload[JAPANESE_FIELDS["day_night"]] = day_night

    if mode == "CONTEST":
        for index in range(1, 6):
            payload[f"W{index}"] = as_float(counts.get(f"w{index}"))

    return payload


def request_google_sheet(method: str, payload: dict | None = None) -> tuple[int, str, str]:
    if not GOOGLE_SHEET_URL:
        raise RuntimeError("SALMONMETRICS_SHEET_URL is not configured")

    outgoing_payload = legacy_append_payload(payload) if method == "POST" and os.getenv("SALMONMETRICS_LEGACY_APPEND_SHIFT") != "false" else payload

    headers = {"Accept": "application/json"}
    if outgoing_payload is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"

    if requests is not None:
        if method == "GET":
            response = requests.get(
                GOOGLE_SHEET_URL,
                timeout=15,
                allow_redirects=True,
                headers=headers,
            )
        else:
            response = requests.post(
                GOOGLE_SHEET_URL,
                json=outgoing_payload,
                timeout=15,
                allow_redirects=True,
                headers=headers,
            )
        return response.status_code, response.text, response.headers.get("content-type", "")

    data = None
    if outgoing_payload is not None:
        data = json.dumps(outgoing_payload, ensure_ascii=False).encode("utf-8")
    request = Request(GOOGLE_SHEET_URL, data=data, method=method, headers=headers)
    try:
        with urlopen(request, timeout=15) as response:
            return (
                int(response.status),
                response.read().decode("utf-8", errors="replace"),
                response.headers.get("content-type", ""),
            )
    except HTTPError as error:
        return (
            int(error.code),
            error.read().decode("utf-8", errors="replace"),
            error.headers.get("content-type", ""),
        )
    except URLError as error:
        raise RuntimeError(str(error.reason)) from error


class SalmonMetricsHandler(BaseHTTPRequestHandler):
    server_version = "SalmonMetricsWeb/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} - {fmt % args}")

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Access-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            self.send_json({"ok": True, "sheetConfigured": bool(GOOGLE_SHEET_URL)})
            return
        if path == "/api/config":
            if not self.require_auth():
                return
            self.send_json(load_shift_config())
            return
        if path == "/api/logs":
            if not self.require_auth():
                return
            self.handle_logs()
            return
        self.serve_static(path)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/config":
            if not self.require_auth():
                return
            self.handle_config_update()
            return
        if path == "/api/submit":
            if not self.require_auth():
                return
            self.handle_submit()
            return
        self.send_json({"error": "Unknown endpoint"}, HTTPStatus.NOT_FOUND)

    def require_auth(self) -> bool:
        if not ACCESS_TOKEN:
            return True
        if self.headers.get("X-Access-Token") == ACCESS_TOKEN:
            return True
        self.send_json(
            {"error": "Access token required", "tokenRequired": True},
            HTTPStatus.UNAUTHORIZED,
        )
        return False

    def read_json(self) -> dict:
        length = int(self.headers.get("content-length", "0") or "0")
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw)

    def send_json(self, data, status: int | HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(int(status))
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_logs(self) -> None:
        try:
            status, text, content_type = request_google_sheet("GET")
            if status != 200:
                self.send_json(
                    {
                        "error": "Google Sheet returned an error",
                        "status": status,
                        "detail": text[:500],
                    },
                    HTTPStatus.BAD_GATEWAY,
                )
                return
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                self.send_json(
                    {
                        "error": "Google Sheet response was not JSON",
                        "contentType": content_type,
                        "detail": text[:500],
                    },
                    HTTPStatus.BAD_GATEWAY,
                )
                return
            self.send_json(data)
        except Exception as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_GATEWAY)

    def handle_submit(self) -> None:
        try:
            body = self.read_json()
            payload = build_sheet_payload(body, load_shift_config())
            status, text, _ = request_google_sheet("POST", payload)
            if status != 200:
                self.send_json(
                    {
                        "error": "Google Sheet rejected the submission",
                        "status": status,
                        "detail": text[:500],
                        "payload": payload,
                    },
                    HTTPStatus.BAD_GATEWAY,
                )
                return
            self.send_json({"ok": True, "sheetStatus": status, "payload": payload})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_GATEWAY)

    def handle_config_update(self) -> None:
        try:
            body = self.read_json()
            self.send_json(save_shift_config(body))
        except json.JSONDecodeError as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_json({"error": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def serve_static(self, request_path: str) -> None:
        if request_path in {"", "/"}:
            request_path = "/index.html"
        decoded = unquote(request_path)
        normalized = posixpath.normpath(decoded).lstrip("/")
        if normalized.startswith("../") or normalized == "..":
            self.send_error(HTTPStatus.FORBIDDEN)
            return

        target = STATIC_DIR / normalized
        if target.is_dir():
            target = target / "index.html"
        if not target.exists() or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        body = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header(
            "Content-Type",
            mimetypes.guess_type(str(target))[0] or "application/octet-stream",
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
    except OSError:
        return socket.gethostbyname(socket.gethostname())


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), SalmonMetricsHandler)
    print("SalmonMetrics web server")
    print(f"Local: http://127.0.0.1:{PORT}")
    print(f"LAN:   http://{local_ip()}:{PORT}")
    if ACCESS_TOKEN:
        print("Access token protection: enabled")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
