"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AttachmentError,
  MAX_ATTACHMENTS,
  readTextFile,
  type AttachedFile,
} from "@/lib/attachments";

export type AttachmentsController = {
  files: AttachedFile[];
  error: string | null;
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeFile: (id: string) => void;
  clear: () => void;
  dismissError: () => void;
};

export function useAttachments(): AttachmentsController {
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const filesRef = useRef<AttachedFile[]>([]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    if (list.length === 0) return;

    const available = MAX_ATTACHMENTS - filesRef.current.length;
    if (available <= 0) {
      setError(`Maksimal ${MAX_ATTACHMENTS} file per pesan.`);
      return;
    }

    setError(null);
    if (list.length > available) {
      setError(`Hanya ${available} file pertama yang dilampirkan (maksimal ${MAX_ATTACHMENTS}).`);
    }

    const accepted: AttachedFile[] = [];
    for (const file of list.slice(0, available)) {
      try {
        accepted.push(await readTextFile(file));
      } catch (cause) {
        setError(cause instanceof AttachmentError ? cause.message : "Gagal membaca file.");
      }
    }

    if (accepted.length > 0) {
      setFiles((current) => [...current, ...accepted].slice(0, MAX_ATTACHMENTS));
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((current) => current.filter((file) => file.id !== id));
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
    setError(null);
  }, []);

  return { files, error, addFiles, removeFile, clear, dismissError: () => setError(null) };
}
