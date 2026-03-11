# Bailout — Implementasi Upload File ke Cloudflare R2

## Overview

Setiap bailout boleh menyertakan **satu file pendukung** yang di-upload langsung ke
Cloudflare R2 (S3-compatible). Jenis file yang diharapkan bergantung pada kategori
bailout:

| Kategori   | File yang diharapkan            | Contoh                     |
| ---------- | ------------------------------- | -------------------------- |
| TRANSPORT  | Tiket / e-ticket                | PDF, JPG, PNG              |
| HOTEL      | Konfirmasi booking hotel        | PDF, JPG, PNG              |
| MEAL       | Struk / receipt makan           | JPG, PNG, PDF              |
| OTHER      | Dokumen pendukung apa saja      | PDF, JPG, PNG              |

**Batas ukuran file: 2 MB** (dikecek di sisi klien sebelum upload).

---

## Alur Upload (Presigned URL)

```
Klien                           Server (tRPC)                  Cloudflare R2
  │                                   │                               │
  │── bailout.getUploadUrl() ─────────▶│                               │
  │                                   │── getPresignedUploadUrl() ───▶│
  │                                   │◀─ signedPutUrl ───────────────│
  │◀── { uploadUrl, key, publicUrl } ─│                               │
  │                                   │                               │
  │── PUT uploadUrl (file binary) ────────────────────────────────────▶│
  │◀── 200 OK ─────────────────────────────────────────────────────────│
  │                                   │                               │
  │── bailout.attachFile({ storageUrl }) ─▶│                          │
  │                                   │── db.bailout.update() ────────│
  │◀── updated bailout ───────────────│                               │
```

File **tidak melewati server Next.js** — langsung dari browser ke R2, sehingga tidak
membebani bandwidth server.

---

## 1. Tambah Dua Mutation ke `src/server/api/routers/bailout.ts`

Tempatkan keduanya di dalam `bailoutRouter` sebelum tanda `});` penutup.

```ts
// ─── GET PRESIGNED UPLOAD URL ─────────────────────────────────────────────
getUploadUrl: protectedProcedure
  .input(
    z.object({
      bailoutId: z.string().min(1),
      filename: z.string().min(1),
      contentType: z.string().min(1),
    }),
  )
  .output(z.any())
  .mutation(async ({ ctx, input }) => {
    // Hanya requester atau roles privileged yang boleh upload
    const bailout = await ctx.db.bailout.findUnique({
      where: { id: input.bailoutId },
      select: { requesterId: true },
    });

    if (!bailout) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Bailout tidak ditemukan" });
    }

    const isOwner = bailout.requesterId === ctx.session.user.id;
    const isPrivileged = userHasAnyRole(ctx.session.user, [
      ...SALES_CHIEF_ROLES,
      Role.FINANCE,
      Role.ADMIN,
    ]);

    if (!isOwner && !isPrivileged) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Tidak berhak upload file ini" });
    }

    const { getPresignedUploadUrl, buildStorageKey, getPublicUrl } =
      await import("@/lib/storage/r2");

    const key = buildStorageKey("bailouts", input.bailoutId, input.filename);
    const uploadUrl = await getPresignedUploadUrl(key, input.contentType, 900);

    return { uploadUrl, key, publicUrl: getPublicUrl(key) };
  }),

// ─── ATTACH FILE (simpan URL setelah upload berhasil) ───────────────────
attachFile: protectedProcedure
  .input(
    z.object({
      id: z.string(),
      storageUrl: z.string().url(),
    }),
  )
  .output(z.any())
  .mutation(async ({ ctx, input }) => {
    const bailout = await ctx.db.bailout.findUnique({
      where: { id: input.id },
      select: { requesterId: true },
    });

    if (!bailout) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Bailout tidak ditemukan" });
    }

    const isOwner = bailout.requesterId === ctx.session.user.id;
    const isPrivileged = userHasAnyRole(ctx.session.user, [
      ...SALES_CHIEF_ROLES,
      Role.FINANCE,
      Role.ADMIN,
    ]);

    if (!isOwner && !isPrivileged) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Tidak berhak mengubah file ini" });
    }

    return ctx.db.bailout.update({
      where: { id: input.id },
      data: { storageUrl: input.storageUrl },
    });
  }),
```

---

## 2. Komponen `BailoutFileUpload`

Buat file baru: **`src/components/features/BailoutFileUpload.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { api } from "@/trpc/react";

// Tipe MIME yang diizinkan
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

type BailoutCategory = "TRANSPORT" | "HOTEL" | "MEAL" | "OTHER";

const FILE_LABEL: Record<BailoutCategory, string> = {
  TRANSPORT: "Upload Tiket",
  HOTEL: "Upload Konfirmasi Booking Hotel",
  MEAL: "Upload Struk Makan",
  OTHER: "Upload Dokumen Pendukung",
};

const FILE_HINT: Record<BailoutCategory, string> = {
  TRANSPORT: "E-ticket atau foto tiket (PDF / JPG / PNG, maks. 2 MB)",
  HOTEL: "Konfirmasi booking dari hotel / OTA (PDF / JPG / PNG, maks. 2 MB)",
  MEAL: "Foto struk atau nota makan (JPG / PNG / PDF, maks. 2 MB)",
  OTHER: "Dokumen pendukung apa saja (PDF / JPG / PNG, maks. 2 MB)",
};

interface Props {
  bailoutId: string;
  category: BailoutCategory;
  currentUrl: string | null | undefined;
  onUploaded: (url: string) => void; // dipanggil setelah URL tersimpan
}

export function BailoutFileUpload({ bailoutId, category, currentUrl, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const getUploadUrl = api.bailout.getUploadUrl.useMutation();
  const attachFile = api.bailout.attachFile.useMutation();

  const handleFile = async (file: File) => {
    setError("");

    // — Validasi tipe —
    if (!ALLOWED_MIME.includes(file.type)) {
      setError("Format file tidak didukung. Gunakan PDF, JPG, atau PNG.");
      return;
    }

    // — Validasi ukuran (2 MB) —
    if (file.size > MAX_BYTES) {
      setError(`Ukuran file melebihi batas 2 MB (ukuran file: ${(file.size / 1024 / 1024).toFixed(2)} MB).`);
      return;
    }

    try {
      setUploading(true);

      // 1. Minta presigned URL dari server
      const { uploadUrl, publicUrl } = await getUploadUrl.mutateAsync({
        bailoutId,
        filename: file.name,
        contentType: file.type,
      });

      if (!uploadUrl) throw new Error("Gagal mendapatkan upload URL.");

      // 2. Upload langsung ke R2
      const res = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!res.ok) throw new Error(`Upload gagal (HTTP ${res.status})`);

      // 3. Simpan URL ke database
      const finalUrl = publicUrl ?? uploadUrl.split("?")[0]!;
      await attachFile.mutateAsync({ id: bailoutId, storageUrl: finalUrl });

      // 4. Tampilkan preview jika gambar
      if (file.type.startsWith("image/")) {
        setPreviewUrl(URL.createObjectURL(file));
      } else {
        setPreviewUrl(null);
      }

      onUploaded(finalUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload gagal, coba lagi.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-700">
        {FILE_LABEL[category]}
      </label>

      {/* Drop-zone / picker */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
          uploading
            ? "border-blue-300 bg-blue-50"
            : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
        }`}
      >
        {uploading ? (
          <p className="text-sm text-blue-600">Mengupload…</p>
        ) : currentUrl && !previewUrl ? (
          <p className="text-xs text-green-600">✓ File sudah terupload — klik untuk ganti</p>
        ) : (
          <>
            <p className="text-sm text-gray-500">Klik atau seret file ke sini</p>
            <p className="mt-1 text-xs text-gray-400">{FILE_HINT[category]}</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_MIME.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";      // reset supaya file yang sama bisa dipilih ulang
        }}
      />

      {/* Error */}
      {error && (
        <p className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">{error}</p>
      )}

      {/* Preview gambar / link PDF */}
      {previewUrl && (
        <img
          src={previewUrl}
          alt="Preview"
          className="mt-2 max-h-48 w-full rounded-lg object-contain border"
        />
      )}
      {!previewUrl && currentUrl && (
        <a
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-xs text-blue-600 hover:underline"
        >
          📎 {currentUrl.split("/").pop()}
        </a>
      )}
    </div>
  );
}
```

---

## 3. Integrasi ke `ActionModal` di `bailout/page.tsx`

### 3a. Tambahkan import di bagian atas file

```tsx
import { BailoutFileUpload } from "@/components/features/BailoutFileUpload";
```

### 3b. Tambahkan state & section baru dalam `ActionModal`

Pada komponen `ActionModal`, tambahkan **setelah blok info bailout** (sebelum `{/* Reject Form */}`):

```tsx
{/* ── Upload File Pendukung ──────────────────────────────── */}
<div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
  <BailoutFileUpload
    bailoutId={bailout.id}
    category={bailout.category as "TRANSPORT" | "HOTEL" | "MEAL" | "OTHER"}
    currentUrl={bailout.storageUrl}
    onUploaded={() => onDone()}
  />
</div>
```

### 3c. Update tipe `Bailout` dalam `page.tsx`

Tambahkan dua field yang belum ada di interface:

```tsx
interface Bailout {
  // ... field yang sudah ada ...
  category: "TRANSPORT" | "HOTEL" | "MEAL" | "OTHER";  // ← tambah
  storageUrl: string | null;                             // ← tambah
}
```

---

## 4. Environment Variables yang Dibutuhkan

Semua variabel sudah terdefinisi di `env.js`. Pastikan `.env` (atau environment
hosting) berisi nilai yang valid:

```env
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret-key>
R2_BUCKET_NAME=travel-claim-files
R2_PUBLIC_URL=https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev
```

> **Catatan:** `R2_PUBLIC_URL` adalah custom domain atau URL publik R2. Jika bucket
> bersifat private, `getPublicUrl()` akan mengembalikan `null` dan file hanya bisa
> diakses via presigned download URL.

---

## 5. Aturan CORS di Cloudflare R2

Agar browser bisa melakukan `PUT` langsung ke R2, tambahkan CORS rule di dashboard
Cloudflare → R2 → bucket → Settings → CORS:

```json
[
  {
    "AllowedOrigins": ["https://your-app-domain.com", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 6. Validasi di Sisi Server (Opsional — Defence-in-Depth)

`getUploadUrl` hanya menerbitkan URL presign; ia tidak bisa mencegah pengguna
meng-upload file berukuran besar setelah mendapatkan URL. Untuk menambah lapisan
keamanan, set **`ContentLengthRange`** pada perintah PutObject di `r2.ts`:

```ts
// Di src/lib/storage/r2.ts → fungsi getPresignedUploadUrl
const command = new PutObjectCommand({
  Bucket: R2_BUCKET,
  Key: key,
  ContentType: contentType,
  // Batasi ukuran: 1 byte – 2 MB
  // Catatan: parameter ini didukung oleh AWS S3 tetapi
  // belum tersedia di Cloudflare R2 per Q1-2026.
  // Gunakan validasi klien (sudah ada di komponen) sebagai kontrol utama.
});
```

> Cloudflare R2 belum mendukung `x-amz-content-sha256` kondisional atau
> `ContentLengthRange` pada presigned URL. Validasi 2 MB di sisi klien pada
> komponen `BailoutFileUpload` adalah kontrol yang berlaku saat ini.

---

## 7. Ringkasan Perubahan File

| File | Perubahan |
|------|-----------|
| `src/server/api/routers/bailout.ts` | Tambah mutation `getUploadUrl` dan `attachFile` |
| `src/components/features/BailoutFileUpload.tsx` | **Buat baru** — komponen upload dengan validasi 2 MB |
| `src/app/(authenticated)/bailout/page.tsx` | Import komponen, update interface `Bailout`, tambah section upload di `ActionModal` |
| `.env` | Pastikan 5 variabel R2 terisi |
| Cloudflare R2 Dashboard | Tambah CORS rule untuk domain aplikasi |
