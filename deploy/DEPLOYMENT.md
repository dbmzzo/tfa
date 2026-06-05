# TFA Backend Deployment

The public site is currently deployed as static files only. That is why:

- `https://t-f-a-trivia-fairnes-associationcom.tv/message-board-access.html` loads
- but `https://t-f-a-trivia-fairnes-associationcom.tv/api/register` returns `404`

To enable real accounts, thread creation, replies, and hoots on the hosted site:

1. Upload this repo to the web server as usual.
2. Copy `deploy/tfa-message-board.service` to:
   `/etc/systemd/system/tfa-message-board.service`
3. Adjust the `User`, `WorkingDirectory`, and `ExecStart` paths if the site is not deployed at `/var/www/tfa`.
4. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tfa-message-board.service
sudo systemctl status tfa-message-board.service
```

5. Add the Nginx snippet from `deploy/nginx-tfa-backend.conf` to the server block for:
   `t-f-a-trivia-fairnes-associationcom.tv`

6. Reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

7. Verify:

```bash
curl -i https://t-f-a-trivia-fairnes-associationcom.tv/api/session
curl -i -H 'Content-Type: application/json' \
  -d '{"username":"testuser","password":"StrongPass123","confirm_password":"StrongPass123"}' \
  https://t-f-a-trivia-fairnes-associationcom.tv/api/register
```

Notes:

- The SQLite database is created automatically in `board-data/message-board.sqlite3`.
- Make sure the service user can write to `/var/www/tfa/board-data`.
- The existing GitHub Actions workflow only uploads files; it does not restart `systemd` or patch Nginx.
