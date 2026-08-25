# Admin Panel

The site now runs behind a small Python (Flask) server that serves the
public pages and a login-protected `/admin` panel for editing room
pricing, add-ons, the food & beverage menu, the homepage gallery/hero
photo, and contact details.

## Run it

```
py -m pip install -r requirements.txt
py server.py
```

Then open http://127.0.0.1:5000 for the public site and
http://127.0.0.1:5000/admin for the admin panel.

The **first time** you run `server.py`, it generates an admin account and
prints the username/password to the console **once**. Copy it down — log
in and change the password immediately from the Account tab. After that,
credentials live (hashed) in `data/admin_auth.json`, which is not
committed to version control.

## What's editable

- **Hero & Contact** — homepage banner text/photo, address, email, phone
  (used across all pages' footers, and the Address/Phone/Email links —
  they open Maps/dialer/email app).
- **Rooms & Pricing** — room names, rates, descriptions, amenities,
  photos, and the tax rate. Feeds `rooms.html`, the booking page, and the
  stay estimator automatically.
- **Add-ons** — breakfast, transfer, etc.
- **Food & Beverage Menu** — grouped items (e.g. Food / Beverages) with
  optional photos. Feeds the interactive page-turning menu at
  `menu.html`, plus the booking/estimator forms' menu picker.
- **Gallery & Imagery** — the 6 homepage gallery photo slots. Leave a
  slot's photo empty and it keeps its decorative placeholder.

Everything else (long-form marketing copy, section layout, "Why Choose
Us", testimonials, experiences) stays as static HTML — edit `index.html`
directly for those.

## Keeping the server running

`server.py` only stays up for as long as its process is running — closing
the terminal it's running in, restarting your PC, or Claude's own session
ending will stop it, and the whole site (public pages + admin) goes down
until it's started again.

**To make it start automatically at every login and stay running
permanently:**

1. Open PowerShell **as Administrator** (Start → type "PowerShell" →
   right-click → "Run as administrator"). This step needs admin rights;
   Claude can't do it for you from a non-elevated session.
2. Run:
   ```
   cd "c:\Users\chand\OneDrive\Desktop\Hamro G&G auto\Gokarna-Hillside-Resort\scripts"
   .\install_startup_task.ps1
   ```
3. That's it — it registers a scheduled task ("GokarnaHillsideResortServer")
   that launches `run_server.ps1` at logon, which starts `server.py` and
   automatically restarts it if it ever crashes. Logs go to `server.log`
   in the project root.

To remove it later: `schtasks /Delete /TN "GokarnaHillsideResortServer" /F`
(also needs an elevated prompt).

**Without that one-time step**, just run `py server.py` yourself whenever
you want to use the site (see "Run it" above) — it'll work fine, but only
for as long as that terminal window stays open.

## How it's protected

- `/admin` requires a login (session cookie); there are no public links
  to it anywhere on the site, and `/robots.txt` disallows it for search
  engines (not a security control, just good hygiene).
- Every content-changing request also requires a per-session CSRF token.
- Login attempts are rate-limited per IP.
- Passwords are hashed (never stored in plaintext); the password is
  generated randomly on first run and shown only once.

**Before putting this on the public internet:** serve it behind HTTPS
(e.g. a reverse proxy/hosting platform that terminates TLS) and set the
environment variable `RESORT_FORCE_HTTPS=1` so the session cookie is
marked `Secure`. Without HTTPS, the login session isn't safe on a public
network. `server.py`'s built-in server is for local use/testing only —
deploy it with a production WSGI server (e.g. `waitress` or `gunicorn`)
behind that reverse proxy.
