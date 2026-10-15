/** Shrinks an uploaded image (logo or signature) on the device and returns a PNG data URL small enough to store. */
export async function imageToDataUrl(file: File, maxSide = 480): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error("Use a PNG, JPG or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is too large. Use one under 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't read that image."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't read that image.");
    ctx.drawImage(img, 0, 0, w, h);
    let out = canvas.toDataURL("image/png");
    // Photos compress far better as JPEG (white background, since JPEG has no transparency).
    if (out.length > 350_000) {
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      out = canvas.toDataURL("image/jpeg", 0.85);
    }
    if (out.length > 380_000) throw new Error("That image is too detailed. Try a simpler or smaller one.");
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
