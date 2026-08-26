import "server-only";

import sharp from "sharp";

const MAX_UPLOAD = 10 * 1024 * 1024;
const ACCEPTED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
]);

export async function normalizeContactPhoto(
  file: File,
): Promise<{ dataBase64: string; mimeType: "image/jpeg" }> {
  if (!ACCEPTED.has(file.type)) throw new Error("Unsupported image format");
  if (file.size <= 0 || file.size > MAX_UPLOAD) {
    throw new Error("Photo must be between 1 byte and 10MB");
  }
  try {
    const output = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize(512, 512, {
        fit: "cover",
        position: "attention",
        withoutEnlargement: false,
      })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    return { dataBase64: output.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    throw new Error(
      "Could not read the photo. On iPhone, choose JPEG or enable Most Compatible.",
    );
  }
}

export async function normalizeCompanyLogo(
  file: File,
): Promise<{ dataBase64: string; mimeType: "image/png" }> {
  if (!ACCEPTED.has(file.type)) throw new Error("Unsupported image format");
  if (file.size <= 0 || file.size > MAX_UPLOAD) {
    throw new Error("Logo must be between 1 byte and 10MB");
  }
  try {
    const output = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize(800, 400, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 8 })
      .toBuffer();
    return { dataBase64: output.toString("base64"), mimeType: "image/png" };
  } catch {
    throw new Error(
      "Could not read the logo. On iPhone, choose PNG or JPEG.",
    );
  }
}
