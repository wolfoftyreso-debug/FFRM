import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  MAX_MMS_PAYLOAD_BYTES,
  prepareMmsImage,
  sanitizeImage,
} from "@/lib/media/image";

describe("image validation and sanitization", () => {
  it("decodes, strips metadata and returns trusted dimensions/mime", async () => {
    const raw = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 3,
        background: { r: 220, g: 20, b: 40 },
      },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Artist: "private metadata" } } })
      .toBuffer();
    const clean = await sanitizeImage(raw);
    expect(clean.mimeType).toBe("image/jpeg");
    expect(clean.width).toBe(120);
    expect(clean.height).toBe(80);
    const meta = await sharp(clean.data).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("rejects arbitrary non-image bytes", async () => {
    await expect(
      sanitizeImage(new TextEncoder().encode("<script>alert(1)</script>")),
    ).rejects.toThrow();
  });

  it("rejects oversized inputs before decoding", async () => {
    await expect(
      sanitizeImage(new Uint8Array(101), 100),
    ).rejects.toThrow(/exceeds/);
  });

  it("compresses outbound images within the 320kB MMS envelope", async () => {
    const noise = Buffer.alloc(2200 * 1600 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 31 + i ** 2) % 256;
    const raw = await sharp(noise, {
      raw: { width: 2200, height: 1600, channels: 3 },
    })
      .png()
      .toBuffer();
    const out = await prepareMmsImage(raw, 200);
    const dataUrlBytes = Buffer.byteLength(
      `data:${out.mimeType};base64,${out.data.toString("base64")}`,
    );
    expect(dataUrlBytes + 200).toBeLessThan(MAX_MMS_PAYLOAD_BYTES);
    expect(out.mimeType).toBe("image/jpeg");
  });
});
