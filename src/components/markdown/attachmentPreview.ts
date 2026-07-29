export const MAX_TEXT_PREVIEW_SIZE = 512 * 1024;

export type AttachmentPreviewKind = "audio" | "video" | "pdf" | "text" | "file";

const TEXT_MIMES = new Set([
  "application/json",
  "application/ld+json",
  "application/sql",
  "application/toml",
  "application/x-httpd-php",
  "application/x-javascript",
  "application/x-ndjson",
  "application/x-sh",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
]);

const TEXT_EXTENSIONS = new Set([
  "c", "cc", "conf", "cpp", "cs", "css", "csv", "env", "go", "h", "hpp",
  "html", "ini", "java", "js", "json", "jsx", "log", "md", "mjs", "php",
  "properties", "py", "rb", "rs", "sh", "sql", "svg", "toml", "ts", "tsx",
  "txt", "xml", "yaml", "yml",
]);

const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "weba"]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mov", "mp4", "ogv", "webm"]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function attachmentPreviewKind(mime: string, name: string): AttachmentPreviewKind {
  const normalizedMime = mime.split(";", 1)[0].trim().toLowerCase();
  const extension = extensionOf(name);
  if (normalizedMime.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (normalizedMime.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) return "video";
  if (normalizedMime === "application/pdf" || extension === "pdf") return "pdf";
  if (normalizedMime.startsWith("text/") || TEXT_MIMES.has(normalizedMime) || TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }
  return "file";
}
