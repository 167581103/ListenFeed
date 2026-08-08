/**
 * Audio ships with the deployment today. Pointing NEXT_PUBLIC_MEDIA_BASE_URL at
 * an object store (R2, Blob) moves delivery off Vercel's bandwidth without
 * touching the library data, since every stored path stays relative.
 */
const base = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "").replace(/\/$/, "");

export function mediaUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${base}${path}`;
}
