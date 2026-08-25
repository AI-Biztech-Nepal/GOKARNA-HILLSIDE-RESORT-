"""
Gokarna Hillside Resort site server.

Serves the public static site and a login-protected /admin panel for
editing imagery, room pricing, add-ons and the food & beverage menu.

Run:
    py -m pip install -r requirements.txt
    py server.py

First run creates data/admin_auth.json with a freshly generated admin
password, printed once to the console. Change it from inside /admin
afterwards ("Change password").
"""
import base64
import copy
import hashlib
import hmac
import json
import os
import re
import secrets
import string
import time
import uuid
from functools import wraps
from pathlib import Path

from flask import Flask, abort, jsonify, redirect, render_template, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_FILE = DATA_DIR / "site_data.json"
AUTH_FILE = DATA_DIR / "admin_auth.json"
UPLOAD_DIR = BASE_DIR / "assets" / "uploads"
ALLOWED_IMAGE_EXT = {"png", "jpg", "jpeg", "webp", "gif", "svg"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB

try:
    DATA_DIR.mkdir(exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    pass  # read-only filesystem (e.g. Vercel serverless); dirs already ship in the deployment bundle

app = Flask(__name__, template_folder="templates")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES + 1024

SECRET_FILE = DATA_DIR / "session_secret.txt"
_fallback_secret = None


def _get_secret_key():
    """Reads/creates the session secret on disk. Falls back to an in-memory
    secret (regenerated per cold start) on a read-only filesystem, so the
    app still boots there instead of crashing on import."""
    global _fallback_secret
    env_secret = os.environ.get("RESORT_SECRET_KEY")
    if env_secret:
        return env_secret
    try:
        if not SECRET_FILE.exists():
            SECRET_FILE.write_text(secrets.token_hex(32), encoding="utf-8")
        return SECRET_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        if _fallback_secret is None:
            _fallback_secret = secrets.token_hex(32)
        return _fallback_secret


app.secret_key = _get_secret_key()

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    # Flip to True once the site is served over HTTPS in production.
    SESSION_COOKIE_SECURE=os.environ.get("RESORT_FORCE_HTTPS") == "1",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 8,
)


# ---------------------------------------------------------------------------
# Admin credentials
# ---------------------------------------------------------------------------

def _generate_password(length=14):
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


_fallback_auth = None


def ensure_admin_account():
    global _fallback_auth
    if AUTH_FILE.exists() or _fallback_auth is not None:
        return
    username = "admin"
    password = _generate_password()
    auth = {"username": username, "password_hash": generate_password_hash(password)}
    try:
        AUTH_FILE.write_text(json.dumps(auth, indent=2), encoding="utf-8")
        persisted = True
    except OSError:
        # Read-only filesystem (e.g. Vercel serverless): keep credentials in
        # memory for this instance instead of crashing on import.
        _fallback_auth = auth
        persisted = False
    banner = "=" * 64
    print(banner)
    print("Gokarna Hillside Resort admin account created.")
    print(f"  URL:      /admin")
    print(f"  Username: {username}")
    print(f"  Password: {password}")
    if not persisted:
        print("NOTE: filesystem is read-only here, so this account only lives")
        print("in memory for this server instance and will reset on restart.")
    print("This password is shown ONLY this once. Log in and change it")
    print("from the admin panel's Account tab.")
    print(banner)


def load_auth():
    if AUTH_FILE.exists():
        return json.loads(AUTH_FILE.read_text(encoding="utf-8"))
    ensure_admin_account()
    if _fallback_auth is not None:
        return _fallback_auth
    return json.loads(AUTH_FILE.read_text(encoding="utf-8"))


def save_auth(auth):
    global _fallback_auth
    try:
        AUTH_FILE.write_text(json.dumps(auth, indent=2), encoding="utf-8")
        _fallback_auth = None
    except OSError:
        _fallback_auth = auth


# ---------------------------------------------------------------------------
# Content store
# ---------------------------------------------------------------------------

def migrate_content(content):
    """Normalizes older data shapes so a stale browser tab (running an older
    version of the admin panel's JS) can never regress the store to a legacy
    format. Applied on every load and before every save."""
    if not isinstance(content, dict):
        return content

    hero = content.get("hero")
    if isinstance(hero, dict):
        if "images" not in hero or not isinstance(hero.get("images"), list):
            legacy_image = hero.get("image")
            hero["images"] = [legacy_image] if legacy_image else []
        hero.pop("image", None)

    if not isinstance(content.get("about"), dict):
        content["about"] = {"image": None}

    if not isinstance(content.get("experiences"), list):
        content["experiences"] = [
            {"id": eid, "image": None}
            for eid in ["nature-walks", "wellness", "viewpoints", "outdoor-dining", "family-time", "local-experiences"]
        ]

    return content


def load_content():
    return migrate_content(json.loads(DATA_FILE.read_text(encoding="utf-8")))


def save_content(content):
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(content, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(DATA_FILE)


def validate_content(content):
    """Minimal shape/type validation so a bad admin edit can't corrupt the store."""
    if not isinstance(content, dict):
        raise ValueError("content must be an object")

    required_top = ["hero", "contact", "currency", "tax_rate", "rooms", "addons", "menu", "gallery"]
    for key in required_top:
        if key not in content:
            raise ValueError(f"missing '{key}'")

    if not isinstance(content["hero"], dict):
        raise ValueError("hero must be an object")
    for key in ["eyebrow", "title_line1", "title_emphasis", "subtitle"]:
        if not isinstance(content["hero"].get(key, ""), str):
            raise ValueError(f"hero.{key} must be a string")
    if not isinstance(content["hero"].get("images", []), list):
        raise ValueError("hero.images must be a list")
    if not all(isinstance(url, str) for url in content["hero"].get("images", [])):
        raise ValueError("hero.images must be a list of strings")

    if not isinstance(content["contact"], dict):
        raise ValueError("contact must be an object")
    for key in ["address", "email", "phone"]:
        if not isinstance(content["contact"].get(key, ""), str):
            raise ValueError(f"contact.{key} must be a string")

    if not isinstance(content.get("about"), dict):
        raise ValueError("about must be an object")
    about_image = content["about"].get("image")
    if about_image is not None and not isinstance(about_image, str):
        raise ValueError("about.image must be a string or null")

    if not isinstance(content.get("experiences"), list):
        raise ValueError("experiences must be a list")
    for exp in content["experiences"]:
        if not isinstance(exp, dict) or not str(exp.get("id", "")).strip():
            raise ValueError("each experience needs an id")
        if exp.get("image") is not None and not isinstance(exp.get("image"), str):
            raise ValueError(f"experience '{exp.get('id')}' image must be a string or null")

    if not isinstance(content["currency"], str) or not content["currency"].strip():
        raise ValueError("currency must be a non-empty string")

    try:
        tax_rate = float(content["tax_rate"])
    except (TypeError, ValueError):
        raise ValueError("tax_rate must be a number")
    if not (0 <= tax_rate <= 1):
        raise ValueError("tax_rate must be between 0 and 1")

    if not isinstance(content["rooms"], list) or not content["rooms"]:
        raise ValueError("rooms must be a non-empty list")
    for room in content["rooms"]:
        if not isinstance(room, dict):
            raise ValueError("each room must be an object")
        if not str(room.get("id", "")).strip():
            raise ValueError("each room needs an id")
        if not str(room.get("name", "")).strip():
            raise ValueError("each room needs a name")
        try:
            rate = float(room.get("rate"))
        except (TypeError, ValueError):
            raise ValueError(f"room '{room.get('id')}' rate must be a number")
        if rate < 0:
            raise ValueError(f"room '{room.get('id')}' rate must be >= 0")
        if not isinstance(room.get("amenities", []), list):
            raise ValueError(f"room '{room.get('id')}' amenities must be a list")

    if not isinstance(content["addons"], list):
        raise ValueError("addons must be a list")
    for addon in content["addons"]:
        if not str(addon.get("id", "")).strip() or not str(addon.get("name", "")).strip():
            raise ValueError("each addon needs an id and name")
        try:
            float(addon.get("rate"))
        except (TypeError, ValueError):
            raise ValueError(f"addon '{addon.get('id')}' rate must be a number")

    if not isinstance(content["menu"], list):
        raise ValueError("menu must be a list")
    for item in content["menu"]:
        if not str(item.get("id", "")).strip() or not str(item.get("name", "")).strip():
            raise ValueError("each menu item needs an id and name")
        try:
            price = float(item.get("price"))
        except (TypeError, ValueError):
            raise ValueError(f"menu item '{item.get('id')}' price must be a number")
        if price < 0:
            raise ValueError(f"menu item '{item.get('id')}' price must be >= 0")
        if not str(item.get("group", "")).strip():
            raise ValueError(f"menu item '{item.get('id')}' needs a group")

    if not isinstance(content["gallery"], list):
        raise ValueError("gallery must be a list")
    for slot in content["gallery"]:
        if not str(slot.get("tag", "")).strip():
            raise ValueError("each gallery slot needs a tag")

    return content


# ---------------------------------------------------------------------------
# Auth helpers: session login + CSRF + login rate limiting
# ---------------------------------------------------------------------------

_login_attempts = {}  # ip -> list[timestamps]
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 8


def _client_ip():
    return request.remote_addr or "unknown"


def is_rate_limited(ip):
    now = time.time()
    attempts = [t for t in _login_attempts.get(ip, []) if now - t < LOGIN_WINDOW_SECONDS]
    _login_attempts[ip] = attempts
    return len(attempts) >= LOGIN_MAX_ATTEMPTS


def record_login_attempt(ip):
    _login_attempts.setdefault(ip, []).append(time.time())


def is_logged_in():
    return bool(session.get("admin_user"))


def require_login(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not is_logged_in():
            if request.path.startswith("/api/"):
                abort(401)
            return redirect("/admin/login")
        return view(*args, **kwargs)
    return wrapped


def require_csrf(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        token = request.headers.get("X-CSRF-Token", "")
        expected = session.get("csrf_token", "")
        if not expected or not hmac.compare_digest(token, expected):
            abort(403)
        return view(*args, **kwargs)
    return wrapped


# ---------------------------------------------------------------------------
# Public routes: the resort site itself
# ---------------------------------------------------------------------------

@app.after_request
def add_security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "SAMEORIGIN"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return resp


@app.route("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/rooms.html")
def rooms_page():
    return send_from_directory(BASE_DIR, "rooms.html")


@app.route("/menu.html")
def menu_page():
    return send_from_directory(BASE_DIR, "menu.html")


@app.route("/book.html")
def book():
    return send_from_directory(BASE_DIR, "book.html")


@app.route("/estimate.html")
def estimate():
    return send_from_directory(BASE_DIR, "estimate.html")


@app.route("/robots.txt")
def robots():
    return app.response_class("User-agent: *\nDisallow: /admin\n", mimetype="text/plain")


@app.route("/assets/pricing.js")
def pricing_js():
    """Generated from the live content store so book.html / estimate.html
    (which load this as a plain <script src>) stay in sync with admin edits
    without needing any changes to those pages."""
    content = load_content()
    payload = {
        "currency": content["currency"],
        "taxRate": content["tax_rate"],
        "rooms": [{"id": r["id"], "name": r["name"], "rate": r["rate"]} for r in content["rooms"]],
        "addons": content["addons"],
        "menu": content["menu"],
    }
    helpers = (BASE_DIR / "assets" / "pricing-helpers.js").read_text(encoding="utf-8")
    body = f"window.RESORT_PRICING = {json.dumps(payload, ensure_ascii=False)};\n\n{helpers}"
    return app.response_class(body, mimetype="application/javascript")


@app.route("/api/content")
def api_content_public():
    """Read-only, used by the public pages to render admin-managed text and images."""
    return jsonify(load_content())


@app.route("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(BASE_DIR / "assets", filename)


# ---------------------------------------------------------------------------
# Admin: login / logout
# ---------------------------------------------------------------------------

@app.route("/admin/login", methods=["GET"])
def admin_login_page():
    if is_logged_in():
        return redirect("/admin")
    return render_template("admin_login.html")


@app.route("/api/admin/login", methods=["POST"])
def admin_login_submit():
    ip = _client_ip()
    if is_rate_limited(ip):
        return jsonify({"error": "Too many attempts. Try again later."}), 429

    data = request.get_json(silent=True) or {}
    username = str(data.get("username", ""))
    password = str(data.get("password", ""))

    auth = load_auth()
    valid = hmac.compare_digest(username, auth["username"]) and check_password_hash(auth["password_hash"], password)
    if not valid:
        record_login_attempt(ip)
        return jsonify({"error": "Invalid username or password."}), 401

    session.clear()
    session.permanent = True
    session["admin_user"] = auth["username"]
    session["csrf_token"] = secrets.token_hex(24)
    return jsonify({"ok": True, "csrfToken": session["csrf_token"]})


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.clear()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Admin: panel + protected API
# ---------------------------------------------------------------------------

@app.route("/admin")
@require_login
def admin_panel():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(24)
    return render_template("admin.html", csrf_token=session["csrf_token"], username=session["admin_user"])


@app.route("/api/admin/content", methods=["GET"])
@require_login
def api_content_admin_get():
    return jsonify(load_content())


@app.route("/api/admin/content", methods=["PUT"])
@require_login
@require_csrf
def api_content_admin_put():
    incoming = request.get_json(silent=True)
    if incoming is None:
        return jsonify({"error": "Invalid JSON body."}), 400
    incoming = migrate_content(incoming)
    try:
        validated = validate_content(incoming)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    try:
        save_content(validated)
    except OSError:
        return jsonify({"error": "This deployment's filesystem is read-only; edits can't be saved here."}), 503
    return jsonify({"ok": True})


@app.route("/api/admin/upload", methods=["POST"])
@require_login
@require_csrf
def api_upload():
    file = request.files.get("image")
    if not file or not file.filename:
        return jsonify({"error": "No file provided."}), 400
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_IMAGE_EXT:
        return jsonify({"error": "Unsupported file type."}), 400

    safe_name = f"{uuid.uuid4().hex}.{ext}"
    dest = UPLOAD_DIR / secure_filename(safe_name)
    try:
        file.save(dest)
    except OSError:
        return jsonify({"error": "This deployment's filesystem is read-only; uploads aren't supported here."}), 503

    if dest.stat().st_size > MAX_UPLOAD_BYTES:
        dest.unlink(missing_ok=True)
        return jsonify({"error": "File too large (max 8 MB)."}), 400

    return jsonify({"ok": True, "url": f"/assets/uploads/{dest.name}"})


@app.route("/api/admin/change-password", methods=["POST"])
@require_login
@require_csrf
def api_change_password():
    data = request.get_json(silent=True) or {}
    current = str(data.get("currentPassword", ""))
    new = str(data.get("newPassword", ""))

    auth = load_auth()
    if not check_password_hash(auth["password_hash"], current):
        return jsonify({"error": "Current password is incorrect."}), 401
    if len(new) < 10:
        return jsonify({"error": "New password must be at least 10 characters."}), 400

    auth["password_hash"] = generate_password_hash(new)
    save_auth(auth)
    return jsonify({"ok": True})


ensure_admin_account()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=False)
