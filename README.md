# Vault — Backend

Secure document-vault API: authentication, file & card storage (S3 or local), search, and account management.

Built with **Node.js · Express · TypeScript · MongoDB (Mongoose) · AWS S3**.

---

## Features

- **Auth** — register / login / logout, JWT **access + refresh** tokens with refresh-token rotation, password reset via email, change password.
- **Files** — upload (S3 or local fallback), list, search, rename, move, copy, favorite, trash/restore, folders.
- **Cards** — store ID/payment card images (front/back) with server-side brightness enhancement.
- **Preview/Download** — presigned **inline** view URLs and **attachment** download URLs; raw byte streaming for in-app spreadsheet/text preview.
- **Dashboard** — file/image/document counts, storage usage, recent activity feed.

## Tech stack

| Area | Choice |
|------|--------|
| Runtime | Node.js + Express 4 |
| Language | TypeScript |
| Database | MongoDB via Mongoose |
| Storage | AWS S3 (SDK v3) with automatic local-disk fallback |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` (12 rounds) |
| Security | Helmet, CORS, rate limiting, compression, NoSQL-injection sanitizer |
| Validation | `express-validator` |
| Email | Nodemailer |

## Quick start

```bash
npm install
cp .env.example .env      # then fill in real values
npm run dev               # tsx watch, http://localhost:5000
```

Build & run production:

```bash
npm run build
npm start
```

## Environment variables

Copy `.env.example` → `.env` and set:

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default 5000) |
| `NODE_ENV` | `development` / `production` |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | **Must be distinct, strong secrets.** The server refuses to start in production with default/weak values. |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Token lifetimes (default `15m` / `7d`) |
| `CLIENT_URL` | Frontend origin for CORS |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_S3_BUCKET` | S3 config. If unset, storage falls back to local disk. |
| `LOCAL_UPLOAD_DIR` | Local storage dir (default `./uploads`) |
| `SMTP_*` | Email for password reset. If unset, reset links are logged to console (dev). |

> **Never commit `.env`.** It is gitignored. Only `.env.example` (placeholders) is tracked.

## Security

- Passwords hashed with **bcrypt (12 rounds)**; never returned in responses (`select: false`).
- **JWT access + refresh** tokens; refresh tokens stored per-user and rotated on use; invalidated on password change/reset.
- Every private route passes through `authenticate`; all resource queries are **scoped by `userId`** (prevents IDOR).
- **Helmet** secure headers, **CORS** restricted to `CLIENT_URL`, **rate limiting** (global + stricter on auth endpoints).
- **NoSQL-injection sanitizer** strips `$`/`.` keys from body & query; **search terms are regex-escaped** (ReDoS-safe).
- File uploads validated by **MIME type allow-list** and **size limit** (100 MB files, 15 MB card images); SVG excluded (stored-XSS vector).
- Errors go through a **central handler** — stack traces are never exposed in production.
- Uploaded objects are keyed under `users/{userId}/<uuid>-<name>` — randomized, per-user, no accidental overwrite.

## AWS S3 setup

1. Create a **private** bucket (block all public access).
2. Create an IAM user limited to `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on that bucket.
3. Put the credentials in `.env` (backend only — never shipped to the frontend).
4. Access is always via **time-limited presigned URLs**; raw S3 URLs are never exposed.

## Project structure

```
src/
  config/        env loading + validation, database connection
  controllers/   HTTP handlers (auth, file, card)
  middleware/    auth, error handler, validation, mongo sanitizer
  models/        Mongoose schemas (User, File, Card, Activity)
  routes/        route definitions
  services/      business logic (auth, file, card, storage, image)
  utils/         helpers (image enhancement)
  index.ts       app bootstrap
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
