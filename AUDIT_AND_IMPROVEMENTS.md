# Document Vault — Audit & Improvement Plan

> Last updated: July 2026  
> Purpose: Single source of truth for known bugs, gaps, decisions, and safe-change rules.

---

## 1. Project Status Summary

### What works today (real, user-helpful)

| Area | Status |
|------|--------|
| Auth (register, login, logout, forgot/reset password, change password) | Working |
| My Files (upload, folders, rename, copy, delete, trash, grid/list) | Working |
| File preview (images, PDF, video, Excel, CSV, text) | Working |
| Download, favorites toggle | Working |
| Search with debounce + filters | Working |
| Trash restore + permanent delete | Working |
| Important Cards page (`/cards`) — add, flip viewer, delete | Working |
| Profile update | Working |
| Theme (light/dark/system) persisted to backend | Working |
| Notification toggles persisted to backend | Working |

### What is partially fake or incomplete

| Feature | Issue |
|---------|-------|
| Move file | Menu item exists; `onMove` not wired on Files page |
| Tags / metadata edit | Backend API exists; no UI |
| Favorites page | List only — no preview/download |
| Upload progress | Simulated bar, not real axios progress |
| Slideshow (gallery preview) | Play/Pause toggles state only; no auto-advance |
| Accent color | Saves to API; UI mostly uses hardcoded `primary-*` colors |
| Share notifications | Toggle exists; no file-sharing feature |
| 2FA | "Coming Soon" placeholder on Profile |
| Language setting | **Removed** — saved to DB but app had no i18n (see Section 6) |
| Dashboard Activity feed | **Removed** — low value vs. other widgets (see Section 5) |

---

## 2. Backend Bugs (details)

### Critical / High

#### BUG-01: Copy file shares storage key
- **File:** `backend/src/services/file.service.ts` → `copyFile`
- **Problem:** New DB record reuses the same `s3Key` / local path as the original. Permanently deleting one copy removes the blob for all copies.
- **User impact:** Possible data loss when user deletes a "copy".
- **Fix (future):** Duplicate blob in storage on copy, assign new key.

#### BUG-02: Folder soft-delete does not cascade
- **File:** `backend/src/services/file.service.ts` → `deleteFile`
- **Problem:** Only the folder row gets `isTrashed: true`. Children stay `isTrashed: false` but parent is trashed — files become hard to find.
- **User impact:** Confusing "missing" files after trashing a folder.
- **Fix (future):** Cascade soft-delete to descendants or block folder delete if non-empty.

#### BUG-03: `confirmPresignedUpload` — no S3 key ownership check
- **File:** `backend/src/services/file.service.ts` → `confirmPresignedUpload`
- **Problem:** Accepts any `key` without verifying `key.startsWith('users/{userId}/')`.
- **User impact:** Security risk in S3 mode only (local dev unaffected).
- **Fix (future):** Validate key prefix before creating DB record.

### Medium

#### BUG-04: `JSON.parse(tags)` can crash upload
- **File:** `backend/src/controllers/file.controller.ts`
- **Problem:** Malformed `tags` JSON in multipart body throws uncaught exception.
- **Fix (future):** try/catch with 400 response.

#### BUG-05: Storage 5GB limit is display-only
- **File:** `backend/src/services/file.service.ts` → `getDashboardStats`
- **Problem:** Dashboard shows limit; uploads are never blocked at 5GB.
- **User impact:** Misleading storage widget.
- **Fix (future):** Reject upload when `storageUsed + fileSize > storageLimit`.

#### BUG-06: Move folder into self or descendant not blocked
- **File:** `backend/src/services/file.service.ts` → `moveFile`
- **Problem:** No cycle detection for folder moves.
- **Fix (future):** Reject invalid target folder IDs.

#### BUG-07: Reset password URL with comma-separated `CLIENT_URL`
- **File:** `backend/src/services/auth.service.ts`
- **Problem:** If `CLIENT_URL` lists multiple origins, reset link is malformed.
- **Fix (future):** Use first origin or dedicated `RESET_URL` env var.

### Low

- `getPresignedUpload` validates size as 1 byte minimum only
- `sortBy` query param not allowlisted in `getFiles`
- Multer 1.x has known CVEs — consider upgrade to 2.x

---

## 3. Frontend Gaps (details)

| ID | Gap | Files | Notes |
|----|-----|-------|-------|
| FE-01 | Move menu dead | `FileCard.tsx`, `FilesPage.tsx`, `api.service.ts` | `fileApi.move` unused |
| FE-02 | No tags/metadata UI | `api.service.ts` `updateMetadata` | Upload has category only |
| FE-03 | Custom category name missing | `UploadModal.tsx` | "custom" option without text field |
| FE-04 | Favorites page incomplete | `FavoritesPage.tsx` | No preview/download |
| FE-05 | Fake upload progress | `UploadModal.tsx` | `setInterval` simulation |
| FE-06 | Slideshow non-functional | `PreviewModal.tsx` | No interval/auto-advance |
| FE-07 | Dashboard recent uploads not clickable | `DashboardPage.tsx` | **Fixed in this sprint** |
| FE-08 | Important Cards missing from Dashboard | `DashboardPage.tsx` | **Fixed in this sprint** |
| FE-09 | Card rename API unused | `api.service.ts` `cardApi.rename` | No UI |
| FE-10 | Mobile file actions hidden | `FileCard.tsx` | `opacity-0` until hover |
| FE-11 | Word (.docx) preview | `PreviewModal.tsx` | Falls through to "not available" |
| FE-12 | No pagination beyond 50 items | Multiple pages | Only Gallery has infinite scroll |

---

## 4. Changes Implemented (this sprint)

### 4.1 Dashboard enhancement

**Removed:**
- "Recent Activity" section from dashboard UI
- `recentActivity` query from `getDashboardStats` API (activity logging elsewhere unchanged)

**Added:**
- 4th stat card: Important Cards count
- Storage usage widget (`ProgressBar`)
- Quick action links (Upload, My Files, Gallery, Important Cards, Search, Favorites)
- Favorites count in stats row context
- Clickable recent uploads → file preview
- Recent Important Cards panel with "View all" → `/cards`
- Category breakdown (top categories by file count)

### 4.2 Language setting removed

**Removed from UI:**
- Language section on Settings page

**Backend:**
- `updateSettings` no longer accepts `language` updates
- `User.settings.language` field kept in MongoDB schema (default `'en'`) for backward compatibility — no migration

### 4.3 Non-regression rules followed

- No changes to auth routes, file upload pipeline, or Cards page CRUD
- No changes to sidebar routes
- `DashboardStats` TypeScript type updated in sync with API
- Activity model and logging preserved for future use

---

## 5. Dashboard Layout (after enhancement)

```
Row 1: [ Total Files ] [ Images ] [ Documents ] [ Important Cards ]

Row 2: [ Storage usage + progress bar ]  |  [ Quick actions grid ]

Row 3: [ Recent uploads (clickable) ]    |  [ Recent Important Cards ]

Row 4: [ Category breakdown chips ]
```

### Why these widgets help the user

| Widget | User benefit |
|--------|----------------|
| Storage | Know how full the vault is before uploading large files |
| Important Cards | Feature was hidden in sidebar only — now visible on home |
| Quick actions | One-click navigation to common tasks |
| Clickable uploads | Open files immediately from home |
| Category breakdown | See how documents are organized at a glance |
| Favorites count | Quick sense of starred items |

### Why Activity was removed

- Duplicated information already in Recent Uploads
- Not actionable (no click-through)
- Extra DB query on every dashboard load
- Activity logging remains in backend for future dedicated page if needed

---

## 6. Language Removal (safe approach)

| Layer | Action |
|-------|--------|
| Frontend Settings | Remove Language section entirely |
| Frontend types | Keep `language?` optional on `UserSettings` for API compatibility |
| Backend controller | Stop accepting `language` in `PUT /auth/settings` |
| Backend model | Keep `language` field with default `'en'` |
| Database | No migration — existing values ignored by UI |

**Will NOT break:** theme, notifications, profile, login, refresh token flow.

---

## 7. Future Work (out of scope — do not break existing flows when implementing)

Priority order for next sprint:

1. Wire Move file UI + folder picker modal
2. Fix copy blob duplication (BUG-01)
3. Fix folder trash cascade (BUG-02)
4. Favorites page — add preview/download
5. Tags + metadata edit UI
6. Real upload progress (`onUploadProgress`)
7. Hide or implement: accent color, share notifications, 2FA
8. Card rename UI
9. Storage quota enforcement (BUG-05)
10. Backend + frontend tests

---

## 8. Non-Regression Checklist

Run after any change:

- [ ] `cd backend && npx tsc --noEmit` — no errors
- [ ] `cd frontend && npx tsc --noEmit` — no errors
- [ ] `cd frontend && npm run build` — succeeds
- [ ] Login → Dashboard loads all stat cards
- [ ] Dashboard: click recent upload → preview opens
- [ ] Dashboard: "View all" cards → `/cards` works
- [ ] Quick actions navigate correctly
- [ ] Upload file from dashboard still works
- [ ] Settings: theme toggle persists after refresh
- [ ] Settings: no Language section visible
- [ ] `/cards` — create and delete card still works

---

## 9. Files Modified (this sprint)

| File | Change |
|------|--------|
| `AUDIT_AND_IMPROVEMENTS.md` | Created (this document) |
| `backend/src/services/file.service.ts` | Extended dashboard stats; removed activity query |
| `backend/src/services/card.service.ts` | Added `getDashboardCardSummary` |
| `backend/src/controllers/auth.controller.ts` | Removed language from settings update |
| `frontend/src/types/index.ts` | Updated `DashboardStats` interface |
| `frontend/src/pages/DashboardPage.tsx` | Enhanced layout; removed Activity |
| `frontend/src/pages/SettingsPage.tsx` | Removed Language section |

---

## 10. API: Dashboard Response Shape (current)

```json
{
  "totalFiles": 0,
  "totalImages": 0,
  "totalDocuments": 0,
  "totalCards": 0,
  "favoriteCount": 0,
  "recentUploads": [],
  "recentCards": [],
  "storageUsed": 0,
  "storageLimit": 5368709120,
  "storagePercentage": 0,
  "categoryBreakdown": [{ "category": "personal", "count": 0 }]
}
```

`recentActivity` has been **removed** from the response.
