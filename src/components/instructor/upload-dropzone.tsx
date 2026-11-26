"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { UploadCloud, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function UploadDropzone({
  endpoint,
  fields,
  accept,
  title,
  hint,
  icon,
  multiple = true,
  children,
}: {
  endpoint: string;
  fields: Record<string, string>;
  accept: string;
  title: string;
  hint: string;
  icon?: React.ReactNode;
  multiple?: boolean;
  children?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [state, setState] = useState<"idle" | "drag" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setState("uploading");
    setMessage(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    const extra = input.current?.form ? new FormData(input.current.form) : null;
    extra?.forEach((v, k) => {
      if (k !== "files" && !fields[k]) fd.append(k, v);
    });
    Array.from(files).forEach((f) => fd.append("files", f));
    try {
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setState("done");
      setMessage("Uploaded. Processing has started.");
      router.refresh();
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Upload failed");
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    upload(e.dataTransfer.files);
  };

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      {children}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setState((s) => (s === "uploading" ? s : "drag"));
        }}
        onDragLeave={() => setState((s) => (s === "drag" ? "idle" : s))}
        onDrop={onDrop}
        className={cn(
          "relative flex flex-col items-center gap-2 rounded-card border-2 border-dashed px-5 py-6 text-center transition-all",
          state === "drag" ? "scale-[1.01] border-primary-600 bg-primary-50" : "border-primary-200 bg-[#f8f9ff]",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={state} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} className="text-primary-600">
            {state === "uploading" ? (
              <Loader2 className="animate-spin" size={28} aria-hidden />
            ) : state === "done" ? (
              <CheckCircle2 className="text-met" size={28} aria-hidden />
            ) : state === "error" ? (
              <AlertCircle className="text-missing" size={28} aria-hidden />
            ) : (
              (icon ?? <UploadCloud size={28} aria-hidden />)
            )}
          </motion.span>
        </AnimatePresence>
        <strong className="text-[15px]">{title}</strong>
        <span className="text-[13px] leading-5 text-ink-2">{hint}</span>
        <label className="mt-1 inline-flex h-10 cursor-pointer items-center rounded-[10px] bg-primary-600 px-4 text-sm font-semibold text-white transition hover:bg-primary-700 active:scale-[0.98]">
          Choose files
          <input
            ref={input}
            type="file"
            name="files"
            accept={accept}
            multiple={multiple}
            className="sr-only"
            onChange={(e) => upload(e.target.files)}
            disabled={state === "uploading"}
          />
        </label>
        {message ? (
          <p role="status" className={cn("text-[13px]", state === "error" ? "text-missing" : "text-ink-2")}>
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
