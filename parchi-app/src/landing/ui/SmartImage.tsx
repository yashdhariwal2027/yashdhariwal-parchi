import { useState } from "react";
import { ImageIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Photo } from "@/landing/content/photos";

const WIDTHS = [480, 720, 960, 1280, 1600];

function isUnsplash(src: string) {
  return src.startsWith("https://images.unsplash.com/");
}

/* Resize only. Never crop on the server: the frame decides what's visible, using photo.focus. */
function unsplashUrl(src: string, width: number) {
  const params = new URLSearchParams({ auto: "format", fit: "max", w: String(width), q: "72" });
  return `${src}?${params.toString()}`;
}

/**
 * Photo that fills its (positioned) parent with object-fit: cover, keeping `photo.focus` in frame.
 * Lazy-loaded, responsive via srcset, and replaced with a neutral tile if it fails to load.
 */
export function SmartImage({
  photo,
  sizes,
  eager = false,
  fallbackIcon: FallbackIcon = ImageIcon,
  className,
  decorative = false,
}: {
  photo: Photo;
  /** Inside a button or link that already says what it is: no alt text, so it isn't read twice */
  decorative?: boolean;
  sizes: string;
  eager?: boolean;
  fallbackIcon?: LucideIcon;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center bg-alt"
        data-image-fallback="true"
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : photo.alt}
        aria-hidden={decorative || undefined}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-card bg-surface text-brand shadow-card">
          <FallbackIcon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </div>
    );
  }

  const unsplash = isUnsplash(photo.src);
  return (
    <img
      src={unsplash ? unsplashUrl(photo.src, 960) : photo.src}
      srcSet={unsplash ? WIDTHS.map((w) => `${unsplashUrl(photo.src, w)} ${w}w`).join(", ") : undefined}
      sizes={sizes}
      alt={decorative ? "" : photo.alt}
      width={photo.width}
      height={photo.height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      style={{ objectPosition: photo.focus }}
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
    />
  );
}
