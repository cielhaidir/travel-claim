"use client";

import { useRef, useState } from "react";
import { api } from "@/trpc/react";

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
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
  // storageUrl field now stores either the object key (Option B) or a public URL (Option A)
  currentUrl: string | null | undefined;
  onUploaded: (key: string) => void;
  canManage?: boolean;
}

export function BailoutFileUpload({
  bailoutId,
  category,
  currentUrl,
  onUploaded,
  canManage = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const getUploadUrl = api.bailout.getUploadUrl.useMutation();
  const attachFile = api.bailout.attachFile.useMutation();

  // Fetch a presigned download URL for the stored key (30-min expiry)
  const fileUrlQuery = api.bailout.getFileUrl.useQuery(
    { id: bailoutId },
    { enabled: !!currentUrl && !previewUrl, staleTime: 25 * 60 * 1000 },
  );
  const downloadUrl =
    (fileUrlQuery.data as { url: string | null } | undefined)?.url ?? null;

  const handleFile = async (file: File) => {
    if (!canManage) return;

    setError("");

    if (!ALLOWED_MIME.includes(file.type)) {
      setError("Format file tidak didukung. Gunakan PDF, JPG, atau PNG.");
      return;
    }

    if (file.size > MAX_BYTES) {
      setError(
        `Ukuran file melebihi batas 2 MB (ukuran file: ${(file.size / 1024 / 1024).toFixed(2)} MB).`,
      );
      return;
    }

    try {
      setUploading(true);

      const result = (await getUploadUrl.mutateAsync({
        bailoutId,
        filename: file.name,
        contentType: file.type,
      })) as { uploadUrl: string; key: string; publicUrl: string | null };

      const { uploadUrl, key, publicUrl } = result;
      if (!uploadUrl) throw new Error("Gagal mendapatkan upload URL.");

      const res = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!res.ok) throw new Error(`Upload gagal (HTTP ${res.status})`);

      // Store the object key (Option B) or public URL (Option A) in the database
      const storageRef = publicUrl ?? key;
      await attachFile.mutateAsync({ id: bailoutId, storageUrl: storageRef });

      if (file.type.startsWith("image/")) {
        setPreviewUrl(URL.createObjectURL(file));
      } else {
        setPreviewUrl(null);
      }

      // Refresh presigned download URL after upload
      void fileUrlQuery.refetch();
      onUploaded(storageRef);
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

      <div
        onClick={() => canManage && !uploading && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!canManage) return;
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
          uploading
            ? "border-blue-300 bg-blue-50"
            : canManage
              ? "cursor-pointer border-gray-300 hover:border-blue-400 hover:bg-gray-50"
              : "border-gray-200 bg-gray-50"
        }`}
      >
        {uploading ? (
          <p className="text-sm text-blue-600">Mengupload...</p>
        ) : !canManage ? (
          currentUrl && !previewUrl ? (
            <p className="text-xs text-green-600">
              File sudah terupload - akses ubah tidak tersedia
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                Tidak ada izin untuk mengubah file
              </p>
              <p className="mt-1 text-xs text-gray-400">{FILE_HINT[category]}</p>
            </>
          )
        ) : currentUrl && !previewUrl ? (
          <p className="text-xs text-green-600">
            File sudah terupload - klik untuk ganti
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-500">Klik atau seret file ke sini</p>
            <p className="mt-1 text-xs text-gray-400">{FILE_HINT[category]}</p>
          </>
        )}
      </div>

      {canManage ? (
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_MIME.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      ) : null}

      {error && (
        <p className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">
          {error}
        </p>
      )}

      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Preview"
          className="mt-2 max-h-48 w-full rounded-lg border object-contain"
        />
      )}
      {!previewUrl && currentUrl && (
        downloadUrl ? (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-xs text-blue-600 hover:underline"
          >
            Lampiran: {currentUrl.split("/").pop()}
          </a>
        ) : (
          <p className="text-xs text-gray-400">
            Lampiran: {currentUrl.split("/").pop()} - memuat link...
          </p>
        )
      )}
    </div>
  );
}
