"use client";

import { useRef, useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/Button";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface AttachmentItem {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  storageProvider: string;
  createdAt: string | Date;
}

interface ClaimAttachmentsProps {
  claimId: string;
  canManage: boolean;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ClaimAttachments({
  claimId,
  canManage,
}: ClaimAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = api.useUtils();
  const [uploadError, setUploadError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawAttachments, isLoading } = api.attachment.getByClaim.useQuery(
    { claimId },
    { enabled: !!claimId, refetchOnWindowFocus: false },
  );

  const attachments = (rawAttachments as AttachmentItem[] | undefined) ?? [];

  const getUploadUrl = api.attachment.getUploadUrl.useMutation();
  const createAttachment = api.attachment.create.useMutation({
    onSuccess: async () => {
      await utils.attachment.getByClaim.invalidate({ claimId });
      setUploadError("");
    },
    onError: (error) => setUploadError(error.message),
  });
  const deleteAttachment = api.attachment.delete.useMutation({
    onSuccess: async () => {
      await utils.attachment.getByClaim.invalidate({ claimId });
      setUploadError("");
    },
    onError: (error) => setUploadError(error.message),
  });

  const isUploading =
    getUploadUrl.isPending || createAttachment.isPending || deleteAttachment.isPending;

  async function handleFile(file: File) {
    setUploadError("");

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setUploadError("Only PDF, JPG, PNG, and WEBP files are allowed.");
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setUploadError("File size exceeds the 10 MB limit.");
      return;
    }

    try {
      const uploadTarget = (await getUploadUrl.mutateAsync({
        claimId,
        filename: file.name,
        contentType: file.type,
      })) as { uploadUrl: string; key: string; publicUrl: string | null };

      const response = await fetch(uploadTarget.uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      await createAttachment.mutateAsync({
        claimId,
        filename: uploadTarget.key.split("/").pop() ?? file.name,
        originalName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        storageUrl: uploadTarget.publicUrl ?? uploadTarget.key,
        storageProvider: "r2",
      });
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Upload failed. Please try again.",
      );
    }
  }

  async function handleDownload(id: string) {
    setDownloadingId(id);
    try {
      const result = await utils.attachment.getDownloadUrl.fetch({ id });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "Failed to open the attachment.",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Attachments</p>
          <p className="text-xs text-gray-500">
            At least one receipt or supporting document is required before submission.
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
          >
            Upload File
          </Button>
        )}
      </div>

      {canManage && (
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_MIME_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFile(file);
            }
            event.target.value = "";
          }}
        />
      )}

      {uploadError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
          {uploadError}
        </p>
      )}

      {isLoading ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
          Loading attachments...
        </div>
      ) : attachments.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
          No attachments uploaded yet.
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">
                  {attachment.originalName}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(attachment.fileSize)} · {attachment.mimeType} ·{" "}
                  {attachment.storageProvider}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={downloadingId === attachment.id}
                  onClick={() => void handleDownload(attachment.id)}
                >
                  {downloadingId === attachment.id ? "Opening..." : "Open"}
                </Button>
                {canManage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={deleteAttachment.isPending}
                    onClick={() => deleteAttachment.mutate({ id: attachment.id })}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
