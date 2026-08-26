import sharp from "sharp";

export const MAX_INBOUND_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_MMS_PAYLOAD_BYTES = 320 * 1024;
// Data URLs base64-expand by ~4/3 and URL encoding adds some overhead.
const OUTBOUND_IMAGE_BUDGET = 200 * 1024;

export interface SanitizedImage {
  data: Buffer;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
}

/**
 * Decode and re-encode an untrusted image. This validates the actual bytes
 * (not the HTTP Content-Type), rejects oversized/decompression-bomb images,
 * strips metadata and any non-image payload, and normalizes GIF to a safe
 * first-frame JPEG. It is a deterministic media sanitizer — not a fake AV
 * scan. Only sanitized bytes are stored or sent to models.
 */
export async function sanitizeImage(
  input: Uint8Array,
  maxInputBytes = MAX_INBOUND_IMAGE_BYTES,
): Promise<SanitizedImage> {
  if (input.byteLength === 0) throw new Error("Image is empty");
  if (input.byteLength > maxInputBytes) {
    throw new Error(`Image exceeds ${maxInputBytes} byte input limit`);
  }

  const image = sharp(input, {
    failOn: "error",
    limitInputPixels: 40_000_000,
    animated: false,
  });
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error("Image has no dimensions");
  if (!["jpeg", "png", "gif", "webp"].includes(meta.format ?? "")) {
    throw new Error(`Unsupported image format: ${meta.format ?? "unknown"}`);
  }

  const usePng =
    meta.format === "png" && (meta.hasAlpha ?? false) && input.byteLength < 2_000_000;
  const data = usePng
    ? await image.rotate().png({ compressionLevel: 9 }).toBuffer()
    : await image.rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const outMeta = await sharp(data).metadata();
  return {
    data,
    mimeType: usePng ? "image/png" : "image/jpeg",
    width: outMeta.width!,
    height: outMeta.height!,
  };
}

/**
 * Prepare a user image for 46elks MMS. Total MMS payload is limited to 320kB,
 * so reserve room for text/form encoding and progressively shrink/encode.
 */
export async function prepareMmsImage(
  input: Uint8Array,
  textBytes = 0,
): Promise<SanitizedImage> {
  if (textBytes > 20_000) throw new Error("MMS text is too large");
  const budget = Math.max(100_000, OUTBOUND_IMAGE_BUDGET - textBytes);
  const base = sharp(input, {
    failOn: "error",
    limitInputPixels: 40_000_000,
    animated: false,
  }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error("Image has no dimensions");
  if (!["jpeg", "png", "gif", "webp"].includes(meta.format ?? "")) {
    throw new Error(`Unsupported image format: ${meta.format ?? "unknown"}`);
  }

  for (const width of [1600, 1280, 1024, 800, 640]) {
    for (const quality of [82, 72, 62, 52, 42]) {
      const data = await base
        .clone()
        .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (data.byteLength <= budget) {
        const out = await sharp(data).metadata();
        return {
          data,
          mimeType: "image/jpeg",
          width: out.width!,
          height: out.height!,
        };
      }
    }
  }
  throw new Error("Image cannot be compressed below the 320kB MMS limit");
}

export async function fetchProviderImage(url: string): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Media URL must use HTTPS");
  if (
    parsed.hostname !== "api.46elks.com" &&
    !parsed.hostname.endsWith(".46elks.com")
  ) {
    throw new Error("Media URL is not a trusted 46elks host");
  }
  const headers: Record<string, string> = {};
  const username = process.env.ELKS46_USERNAME;
  const password = process.env.ELKS46_PASSWORD;
  if (username && password) {
    headers.Authorization =
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  }
  const res = await fetch(url, { headers, redirect: "error" });
  if (!res.ok) throw new Error(`Media fetch failed (${res.status})`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_INBOUND_IMAGE_BYTES) throw new Error("Media is too large");
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.byteLength > MAX_INBOUND_IMAGE_BYTES) throw new Error("Media is too large");
  return data;
}
