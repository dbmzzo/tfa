#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "board-data"
DB_PATH = DATA_DIR / "message-board.sqlite3"
SESSION_COOKIE = "tfa_board_session"
SESSION_TTL_DAYS = 30


def utc_now():
    return datetime.now(timezone.utc)


def isoformat(value):
    return value.astimezone(timezone.utc).isoformat()


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    DATA_DIR.mkdir(exist_ok=True)
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE COLLATE NOCASE,
              password_hash TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              token_hash TEXT PRIMARY KEY,
              user_id INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS threads (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              slug TEXT NOT NULL UNIQUE,
              category TEXT NOT NULL,
              title TEXT NOT NULL,
              body TEXT NOT NULL,
              excerpt TEXT NOT NULL,
              author_id INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS replies (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              thread_key TEXT NOT NULL,
              author_id INTEGER NOT NULL,
              body TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS votes (
              post_key TEXT NOT NULL,
              user_id INTEGER NOT NULL,
              value INTEGER NOT NULL CHECK (value IN (-1, 1)),
              created_at TEXT NOT NULL,
              PRIMARY KEY (post_key, user_id),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_replies_thread_key ON replies(thread_key, created_at)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_votes_post_key ON votes(post_key)"
        )
        connection.commit()


def hash_password(password, salt=None):
    salt_bytes = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt_bytes, 200_000
    )
    return f"{salt_bytes.hex()}:{digest.hex()}"


def verify_password(password, stored_hash):
    salt_hex, _digest_hex = stored_hash.split(":", 1)
    computed = hash_password(password, bytes.fromhex(salt_hex))
    return secrets.compare_digest(computed, stored_hash)


def hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def clean_username(username):
    return username.strip()


def clean_text(value):
    return re.sub(r"\s+", " ", value or "").strip()


def normalize_post_body(value):
    value = (value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    lines = [line.rstrip() for line in value.split("\n")]
    return "\n".join(lines).strip()


def validate_username(username):
    username = clean_username(username)
    if len(username) < 3 or len(username) > 24:
        return "Usernames must be between 3 and 24 characters."
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")
    if any(char not in allowed for char in username):
        return "Usernames can only use letters, numbers, hyphens, and underscores."
    return None


def validate_password(password):
    if len(password) < 8:
        return "Passwords must be at least 8 characters long."
    return None


def validate_thread_key(thread_key):
    if not thread_key or len(thread_key) > 255:
        return "Invalid thread key."
    if not (thread_key.startswith("static:") or thread_key.startswith("dynamic:")):
        return "Invalid thread key."
    return None


def validate_post_key(post_key):
    if not post_key or len(post_key) > 255:
        return "Invalid post key."
    return None


def create_session(user_id):
    token = secrets.token_urlsafe(32)
    now = utc_now()
    expires_at = now + timedelta(days=SESSION_TTL_DAYS)
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (hash_token(token), user_id, isoformat(now), isoformat(expires_at)),
        )
        connection.commit()
    return token, expires_at


def delete_session(token):
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM sessions WHERE token_hash = ?",
            (hash_token(token),),
        )
        connection.commit()


def get_user_by_session(token):
    if not token:
        return None

    now = utc_now()
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM sessions WHERE expires_at <= ?",
            (isoformat(now),),
        )
        connection.commit()
        row = connection.execute(
            """
            SELECT users.id, users.username, users.created_at
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (hash_token(token), isoformat(now)),
        ).fetchone()
    return row


def slugify(text):
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "thread"


def ensure_unique_slug(base_slug):
    slug = base_slug
    suffix = 2
    with get_connection() as connection:
        while connection.execute(
            "SELECT 1 FROM threads WHERE slug = ?",
            (slug,),
        ).fetchone():
            slug = f"{base_slug}-{suffix}"
            suffix += 1
    return slug


def thread_to_payload(row):
    return {
        "slug": row["slug"],
        "category": row["category"],
        "title": row["title"],
        "body": row["body"],
        "excerpt": row["excerpt"],
        "author": row["username"],
        "created_at": row["created_at"],
        "reply_count": row["reply_count"],
        "thread_key": f"dynamic:{row['slug']}",
        "root_post_key": f"dynamic-root:{row['slug']}",
    }


def reply_to_payload(row):
    return {
        "id": row["id"],
        "post_key": f"reply:{row['id']}",
        "thread_key": row["thread_key"],
        "author": row["username"],
        "body": row["body"],
        "created_at": row["created_at"],
    }


def thread_exists(connection, thread_key):
    if thread_key.startswith("static:"):
        return True
    slug = thread_key.split("dynamic:", 1)[1]
    return (
        connection.execute("SELECT 1 FROM threads WHERE slug = ?", (slug,)).fetchone()
        is not None
    )


def list_threads():
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
              threads.slug,
              threads.category,
              threads.title,
              threads.body,
              threads.excerpt,
              threads.created_at,
              users.username,
              COUNT(replies.id) AS reply_count
            FROM threads
            JOIN users ON users.id = threads.author_id
            LEFT JOIN replies ON replies.thread_key = ('dynamic:' || threads.slug)
            GROUP BY threads.id
            ORDER BY threads.created_at DESC
            """
        ).fetchall()
    return [thread_to_payload(row) for row in rows]


def get_thread(slug):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
              threads.slug,
              threads.category,
              threads.title,
              threads.body,
              threads.excerpt,
              threads.created_at,
              users.username,
              COUNT(replies.id) AS reply_count
            FROM threads
            JOIN users ON users.id = threads.author_id
            LEFT JOIN replies ON replies.thread_key = ('dynamic:' || threads.slug)
            WHERE threads.slug = ?
            GROUP BY threads.id
            """,
            (slug,),
        ).fetchone()
    return thread_to_payload(row) if row else None


def list_replies(thread_key):
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT replies.id, replies.thread_key, replies.body, replies.created_at, users.username
            FROM replies
            JOIN users ON users.id = replies.author_id
            WHERE replies.thread_key = ?
            ORDER BY replies.created_at ASC
            """,
            (thread_key,),
        ).fetchall()
    return [reply_to_payload(row) for row in rows]


def get_vote_state(keys, user_id=None):
    keys = [key for key in keys if key]
    if not keys:
        return {}

    placeholders = ",".join("?" for _ in keys)
    result = {
        key: {"up": 0, "down": 0, "user_vote": 0}
        for key in keys
    }
    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT
              post_key,
              SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) AS up_count,
              SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) AS down_count
            FROM votes
            WHERE post_key IN ({placeholders})
            GROUP BY post_key
            """,
            keys,
        ).fetchall()
        for row in rows:
            result[row["post_key"]]["up"] = row["up_count"] or 0
            result[row["post_key"]]["down"] = row["down_count"] or 0

        if user_id:
            rows = connection.execute(
                f"""
                SELECT post_key, value
                FROM votes
                WHERE user_id = ? AND post_key IN ({placeholders})
                """,
                [user_id] + keys,
            ).fetchall()
            for row in rows:
                result[row["post_key"]]["user_vote"] = row["value"]

    return result


class BoardRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/api/session":
            self.handle_session()
            return
        if path == "/api/threads":
            self.handle_list_threads()
            return
        if path == "/api/thread":
            self.handle_get_thread(query)
            return
        if path == "/api/replies":
            self.handle_list_replies(query)
            return
        if path == "/api/votes":
            self.handle_get_votes(query)
            return

        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/register":
            self.handle_register()
            return
        if path == "/api/login":
            self.handle_login()
            return
        if path == "/api/logout":
            self.handle_logout()
            return
        if path == "/api/threads":
            self.handle_create_thread()
            return
        if path == "/api/replies":
            self.handle_create_reply()
            return
        if path == "/api/votes":
            self.handle_cast_vote()
            return

        self.send_error(404, "Not found")

    def parse_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length or 0)
        if not raw_body:
            return {}
        return json.loads(raw_body.decode("utf-8"))

    def send_json(self, status_code, payload, extra_headers=None):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        if extra_headers:
            for name, value in extra_headers:
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(encoded)

    def get_session_cookie(self):
        cookie_header = self.headers.get("Cookie")
        if not cookie_header:
            return None
        jar = cookies.SimpleCookie()
        jar.load(cookie_header)
        morsel = jar.get(SESSION_COOKIE)
        return morsel.value if morsel else None

    def current_user(self):
        return get_user_by_session(self.get_session_cookie())

    def require_auth(self):
        user = self.current_user()
        if not user:
            self.send_json(401, {"ok": False, "error": "You must be signed in to do that."})
            return None
        return user

    def build_session_cookie(self, token, expires_at):
        cookie = cookies.SimpleCookie()
        cookie[SESSION_COOKIE] = token
        cookie[SESSION_COOKIE]["path"] = "/"
        cookie[SESSION_COOKIE]["httponly"] = True
        cookie[SESSION_COOKIE]["samesite"] = "Lax"
        cookie[SESSION_COOKIE]["max-age"] = str(SESSION_TTL_DAYS * 24 * 60 * 60)
        cookie[SESSION_COOKIE]["expires"] = expires_at.strftime("%a, %d %b %Y %H:%M:%S GMT")
        return cookie.output(header="").strip()

    def build_clear_cookie(self):
        cookie = cookies.SimpleCookie()
        cookie[SESSION_COOKIE] = ""
        cookie[SESSION_COOKIE]["path"] = "/"
        cookie[SESSION_COOKIE]["httponly"] = True
        cookie[SESSION_COOKIE]["samesite"] = "Lax"
        cookie[SESSION_COOKIE]["max-age"] = "0"
        cookie[SESSION_COOKIE]["expires"] = "Thu, 01 Jan 1970 00:00:00 GMT"
        return cookie.output(header="").strip()

    def current_user_payload(self):
        user = self.current_user()
        if not user:
            return {"authenticated": False, "user": None}
        return {
            "authenticated": True,
            "user": {
                "id": user["id"],
                "username": user["username"],
                "created_at": user["created_at"],
            },
        }

    def handle_session(self):
        self.send_json(200, self.current_user_payload())

    def handle_register(self):
        try:
            payload = self.parse_json_body()
        except json.JSONDecodeError:
            self.send_json(400, {"ok": False, "error": "Invalid JSON body."})
            return

        username = clean_username(payload.get("username", ""))
        password = payload.get("password", "")
        confirm_password = payload.get("confirm_password", "")

        username_error = validate_username(username)
        if username_error:
            self.send_json(400, {"ok": False, "error": username_error})
            return

        password_error = validate_password(password)
        if password_error:
            self.send_json(400, {"ok": False, "error": password_error})
            return

        if password != confirm_password:
            self.send_json(400, {"ok": False, "error": "Passwords do not match."})
            return

        created_at = isoformat(utc_now())
        try:
            with get_connection() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO users (username, password_hash, created_at)
                    VALUES (?, ?, ?)
                    """,
                    (username, hash_password(password), created_at),
                )
                connection.commit()
                user_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            self.send_json(409, {"ok": False, "error": "That username is already taken."})
            return

        token, expires_at = create_session(user_id)
        self.send_json(
            201,
            {
                "ok": True,
                "message": "Account created. You are now signed in.",
                "user": {"id": user_id, "username": username, "created_at": created_at},
            },
            extra_headers=[("Set-Cookie", self.build_session_cookie(token, expires_at))],
        )

    def handle_login(self):
        try:
            payload = self.parse_json_body()
        except json.JSONDecodeError:
            self.send_json(400, {"ok": False, "error": "Invalid JSON body."})
            return

        username = clean_username(payload.get("username", ""))
        password = payload.get("password", "")

        if not username or not password:
            self.send_json(400, {"ok": False, "error": "Enter both username and password."})
            return

        with get_connection() as connection:
            user = connection.execute(
                """
                SELECT id, username, password_hash, created_at
                FROM users
                WHERE username = ? COLLATE NOCASE
                """,
                (username,),
            ).fetchone()

        if not user or not verify_password(password, user["password_hash"]):
            self.send_json(401, {"ok": False, "error": "Incorrect username or password."})
            return

        token, expires_at = create_session(user["id"])
        self.send_json(
            200,
            {
                "ok": True,
                "message": "Signed in successfully.",
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "created_at": user["created_at"],
                },
            },
            extra_headers=[("Set-Cookie", self.build_session_cookie(token, expires_at))],
        )

    def handle_logout(self):
        token = self.get_session_cookie()
        if token:
            delete_session(token)
        self.send_json(
            200,
            {"ok": True, "message": "Signed out."},
            extra_headers=[("Set-Cookie", self.build_clear_cookie())],
        )

    def handle_list_threads(self):
        self.send_json(200, {"ok": True, "threads": list_threads()})

    def handle_get_thread(self, query):
        slug = clean_text((query.get("slug") or [""])[0])
        if not slug:
            self.send_json(400, {"ok": False, "error": "Missing thread slug."})
            return
        thread = get_thread(slug)
        if not thread:
            self.send_json(404, {"ok": False, "error": "Thread not found."})
            return
        self.send_json(200, {"ok": True, "thread": thread})

    def handle_create_thread(self):
        user = self.require_auth()
        if not user:
            return

        try:
            payload = self.parse_json_body()
        except json.JSONDecodeError:
            self.send_json(400, {"ok": False, "error": "Invalid JSON body."})
            return

        title = clean_text(payload.get("title", ""))
        category = clean_text(payload.get("category", ""))
        body = normalize_post_body(payload.get("body", ""))

        if len(title) < 8 or len(title) > 140:
            self.send_json(400, {"ok": False, "error": "Thread titles must be between 8 and 140 characters."})
            return
        if len(category) < 3 or len(category) > 48:
            self.send_json(400, {"ok": False, "error": "Choose a category between 3 and 48 characters."})
            return
        if len(body) < 12 or len(body) > 6000:
            self.send_json(400, {"ok": False, "error": "Opening posts must be between 12 and 6000 characters."})
            return

        slug = ensure_unique_slug(slugify(title))
        excerpt = body.replace("\n", " ")
        if len(excerpt) > 160:
            excerpt = excerpt[:157].rstrip() + "..."
        created_at = isoformat(utc_now())

        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO threads (slug, category, title, body, excerpt, author_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (slug, category, title, body, excerpt, user["id"], created_at),
            )
            connection.commit()

        self.send_json(201, {"ok": True, "thread": get_thread(slug)})

    def handle_list_replies(self, query):
        thread_key = clean_text((query.get("thread_key") or [""])[0])
        key_error = validate_thread_key(thread_key)
        if key_error:
            self.send_json(400, {"ok": False, "error": key_error})
            return
        self.send_json(200, {"ok": True, "replies": list_replies(thread_key)})

    def handle_create_reply(self):
        user = self.require_auth()
        if not user:
            return

        try:
            payload = self.parse_json_body()
        except json.JSONDecodeError:
            self.send_json(400, {"ok": False, "error": "Invalid JSON body."})
            return

        thread_key = clean_text(payload.get("thread_key", ""))
        body = normalize_post_body(payload.get("body", ""))

        key_error = validate_thread_key(thread_key)
        if key_error:
            self.send_json(400, {"ok": False, "error": key_error})
            return
        if len(body) < 2 or len(body) > 4000:
            self.send_json(400, {"ok": False, "error": "Replies must be between 2 and 4000 characters."})
            return

        created_at = isoformat(utc_now())
        with get_connection() as connection:
            if not thread_exists(connection, thread_key):
                self.send_json(404, {"ok": False, "error": "Thread not found."})
                return

            cursor = connection.execute(
                """
                INSERT INTO replies (thread_key, author_id, body, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (thread_key, user["id"], body, created_at),
            )
            connection.commit()
            reply_id = cursor.lastrowid
            row = connection.execute(
                """
                SELECT replies.id, replies.thread_key, replies.body, replies.created_at, users.username
                FROM replies
                JOIN users ON users.id = replies.author_id
                WHERE replies.id = ?
                """,
                (reply_id,),
            ).fetchone()

        self.send_json(201, {"ok": True, "reply": reply_to_payload(row)})

    def handle_get_votes(self, query):
        raw_keys = query.get("keys", [])
        keys = []
        for value in raw_keys:
            keys.extend([part for part in value.split(",") if part])
        user = self.current_user()
        self.send_json(
            200,
            {
                "ok": True,
                "votes": get_vote_state(keys, user["id"] if user else None),
            },
        )

    def handle_cast_vote(self):
        user = self.require_auth()
        if not user:
            return

        try:
            payload = self.parse_json_body()
        except json.JSONDecodeError:
            self.send_json(400, {"ok": False, "error": "Invalid JSON body."})
            return

        post_key = clean_text(payload.get("post_key", ""))
        value = payload.get("value")

        key_error = validate_post_key(post_key)
        if key_error:
            self.send_json(400, {"ok": False, "error": key_error})
            return
        if value not in (-1, 0, 1):
            self.send_json(400, {"ok": False, "error": "Votes must be -1, 0, or 1."})
            return

        with get_connection() as connection:
            if value == 0:
                connection.execute(
                    "DELETE FROM votes WHERE post_key = ? AND user_id = ?",
                    (post_key, user["id"]),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO votes (post_key, user_id, value, created_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(post_key, user_id)
                    DO UPDATE SET value = excluded.value, created_at = excluded.created_at
                    """,
                    (post_key, user["id"], value, isoformat(utc_now())),
                )
            connection.commit()

        self.send_json(
            200,
            {
                "ok": True,
                "vote": get_vote_state([post_key], user["id"]).get(
                    post_key, {"up": 0, "down": 0, "user_vote": 0}
                ),
            },
        )


def main():
    parser = argparse.ArgumentParser(description="Run the TFA message board server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    init_db()
    server = ThreadingHTTPServer((args.host, args.port), BoardRequestHandler)
    print(
        f"TFA message board available at http://{args.host}:{args.port}/message-board.html"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
