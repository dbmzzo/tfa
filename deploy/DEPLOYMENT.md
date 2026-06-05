# TFA Backend Deployment

The public site is currently deployed as static files only. That is why:

- `https://t-f-a-trivia-fairnes-associationcom.tv/message-board-access.html` loads
- but `https://t-f-a-trivia-fairnes-associationcom.tv/api/register` returns `404`

The production site root is:

```text
/var/www/t-f-a-trivia-fairnes-associationcom.tv
```

To enable real accounts, thread creation, replies, and hoots on the hosted site:

1. Upload this repo to the web server as usual.
2. On the server, install the systemd service:

```bash
sudo cp /var/www/t-f-a-trivia-fairnes-associationcom.tv/deploy/tfa-message-board.service /etc/systemd/system/tfa-message-board.service
```

3. Create the board data directory and make it writable by the service user:

```bash
sudo mkdir -p /var/www/t-f-a-trivia-fairnes-associationcom.tv/board-data
sudo chown -R www-data:www-data /var/www/t-f-a-trivia-fairnes-associationcom.tv/board-data
```

4. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tfa-message-board.service
sudo systemctl status tfa-message-board.service
```

5. Add the Nginx snippet from `deploy/nginx-tfa-backend.conf` inside the `server { ... }` block for `t-f-a-trivia-fairnes-associationcom.tv`:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:9000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

6. Reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

7. Verify:

```bash
curl -i http://127.0.0.1:9000/api/session
curl -i https://t-f-a-trivia-fairnes-associationcom.tv/api/session
curl -i -H 'Content-Type: application/json' \
  -d '{"username":"testuser","password":"StrongPass123","confirm_password":"StrongPass123"}' \
  https://t-f-a-trivia-fairnes-associationcom.tv/api/register
```

Notes:

- The SQLite database is created automatically in `board-data/message-board.sqlite3`.
- The GitHub Actions deploy excludes `board-data/` so deployments do not delete the live database.
- The GitHub Actions workflow uploads files; it does not restart `systemd` or patch Nginx.
