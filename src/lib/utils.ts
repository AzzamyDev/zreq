import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Trigger a browser/WebView file download for text content. */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "text/plain;charset=utf-8"
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke — immediate revoke breaks downloads in WebView2/Tauri.
  window.setTimeout(() => URL.revokeObjectURL(url), 100)
}

export type SaveTextFileResult = "saved" | "cancelled" | "error"

function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".")
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "txt"
}

/** Save text to disk — Tauri save dialog when available, otherwise browser download. */
export async function saveTextFile(
  filename: string,
  content: string,
  mimeType = "text/plain;charset=utf-8"
): Promise<SaveTextFileResult> {
  try {
    const { isTauri } = await import("@tauri-apps/api/core")
    if (isTauri()) {
      const { save } = await import("@tauri-apps/plugin-dialog")
      const { writeTextFile } = await import("@tauri-apps/plugin-fs")
      const ext = fileExtension(filename)
      const path = await save({
        defaultPath: filename,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      })
      if (!path) return "cancelled"
      await writeTextFile(path, content)
      return "saved"
    }

    downloadTextFile(filename, content, mimeType)
    return "saved"
  } catch {
    return "error"
  }
}
