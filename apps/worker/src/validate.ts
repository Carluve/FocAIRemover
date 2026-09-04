/**
 * Allowlist by extension (primary) and a coarse content-type check.
 * Dispatch matches upstream watermarks-remover: name extension + magic later in the cleaner.
 */

const ALLOWED_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "heic",
  "heif",
  "bmp",
  "gif",
  "tif",
  "tiff",
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "odt",
  "ods",
  "odp",
  "epub",
  "mp4",
  "mov",
  "m4a",
  "m4v",
  "wav",
  "mp3",
  "flac",
]);

const BLOCKED_EXT = new Set([
  "exe",
  "dll",
  "bat",
  "cmd",
  "com",
  "scr",
  "js",
  "mjs",
  "cjs",
  "sh",
  "ps1",
  "php",
  "wasm",
]);

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function sanitizeDownloadName(original: string, fallbackExt: string): string {
  const base = original.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ()\[\]]+/g, "_").slice(0, 180);
  if (!cleaned || cleaned.startsWith(".")) {
    return `cleaned.${fallbackExt || "bin"}`;
  }
  const ext = extensionOf(cleaned);
  if (!ext) return `${cleaned}.cleaned.${fallbackExt || "bin"}`;
  return cleaned.replace(/\.[^.]+$/, ".cleaned.$&");
}

export function assertAllowedFile(filename: string, contentType: string | null, size: number, maxBytes: number): {
  extension: string;
} {
  if (size <= 0) {
    throw new ValidationError("empty file", "empty_file");
  }
  if (size > maxBytes) {
    throw new ValidationError(
      `file exceeds max size of ${maxBytes} bytes`,
      "file_too_large",
      413,
    );
  }
  const extension = extensionOf(filename);
  if (!extension) {
    throw new ValidationError("filename must include an allowed extension", "missing_extension");
  }
  if (BLOCKED_EXT.has(extension)) {
    throw new ValidationError(`extension .${extension} is not allowed`, "extension_blocked");
  }
  if (!ALLOWED_EXT.has(extension)) {
    throw new ValidationError(
      `extension .${extension} is not in the allowlist`,
      "extension_not_allowed",
    );
  }
  if (contentType) {
    const ct = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
    if (ct === "application/x-msdownload" || ct === "application/x-executable") {
      throw new ValidationError("content-type is not allowed", "content_type_blocked");
    }
  }
  return { extension };
}

export function parseMaxBytes(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 32 * 1024 * 1024;
}
