# Cập nhật phiên bản

Hướng dẫn cập nhật mdconvert đang chạy trên VPS của bạn khi có phiên bản mới.

## Theo dõi bản cập nhật

Watch [GitHub repository](https://github.com/nhannguyen09/mdconvert) để nhận thông báo khi có Release mới:

- Vào repo → click **Watch** → chọn **Releases only**
- Bạn sẽ nhận email mỗi khi có phiên bản mới

Hoặc kiểm tra thủ công tại [trang Releases](https://github.com/nhannguyen09/mdconvert/releases).

---

## Docker (Khuyến nghị)

```bash
cd /your/mdconvert

# Pull code mới nhất
git pull origin main

# Rebuild và restart
docker compose down
docker compose up -d --build
```

Xong. Prisma migrations chạy tự động khi khởi động.

---

## VPS với PM2

```bash
cd /var/www/mdconvert

# 1. Pull code mới nhất
git pull origin main

# 2. Cài dependencies mới (nếu có)
npm install

# 3. Chạy database migrations
npx prisma migrate deploy

# 4. Build lại
npm run build

# 5. Restart
pm2 restart mdconvert
```

---

## Ghi chú theo từng phiên bản

### v1.0.3

Không có breaking changes. Thêm test suite và CI pipeline (chỉ ảnh hưởng dev — không cần làm gì trên production).

### v1.0.2

**Cần chạy database migration** — chạy `npx prisma migrate deploy` trước khi restart.

Thay đổi: security fixes (path traversal, ownership check, atomic update), exponential backoff polling.

### v1.0.1

**Cần cài `pdfinfo`** — cài `poppler-utils` nếu chưa có:

```bash
sudo apt install poppler-utils
```

Thay đổi: đếm trang PDF qua `pdfinfo`, thêm settings `pdf_pages_per_batch` và `pdf_max_pages`.

### v1.0.0

Phiên bản đầu tiên — chỉ cài mới, không cập nhật.

---

## Rollback

Nếu có sự cố, quay lại phiên bản cũ:

```bash
git log --oneline        # tìm commit hash
git checkout v1.0.2      # hoặc dùng tag
npm install
npx prisma migrate deploy
npm run build
pm2 restart mdconvert
```
