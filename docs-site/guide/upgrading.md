# Upgrading

How to update your self-hosted mdconvert instance when a new version is released.

## Check for updates

Watch the [GitHub repository](https://github.com/nhannguyen09/mdconvert) to get notified when a new release is published:

- Go to the repo → click **Watch** → select **Releases only**
- You'll receive an email whenever a new version is released

Or check the [Releases page](https://github.com/nhannguyen09/mdconvert/releases) manually.

---

## Docker (Recommended)

```bash
cd /your/mdconvert

# Pull latest code
git pull origin main

# Rebuild and restart
docker compose down
docker compose up -d --build
```

That's it. Prisma migrations run automatically on startup.

---

## VPS with PM2

```bash
cd /var/www/mdconvert

# 1. Pull latest code
git pull origin main

# 2. Install any new dependencies
npm install

# 3. Run database migrations
npx prisma migrate deploy

# 4. Rebuild
npm run build

# 5. Restart
pm2 restart mdconvert
```

---

## Version-specific notes

### v1.0.3

No breaking changes. Adds test suite and CI pipeline (dev only — no action needed for production).

### v1.0.2

**Requires database migration** — run `npx prisma migrate deploy` before restarting.

Changes: security fixes (path traversal, ownership checks, atomic updates), exponential backoff polling.

### v1.0.1

**Requires `pdfinfo`** — install `poppler-utils` if not already installed:

```bash
sudo apt install poppler-utils
```

Changes: PDF page counting via `pdfinfo`, configurable batch settings (`pdf_pages_per_batch`, `pdf_max_pages`).

### v1.0.0

Initial release — fresh install only.

---

## Rollback

If something goes wrong, roll back to a previous version:

```bash
git log --oneline        # find the commit hash
git checkout v1.0.2      # or use a tag
npm install
npx prisma migrate deploy
npm run build
pm2 restart mdconvert
```
