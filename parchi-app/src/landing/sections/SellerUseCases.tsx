import { ArrowRight, CakeSlice, Gem, Gift, Shirt, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHOTOS, type Photo } from "@/landing/content/photos";
import { showUseCase, type UseCaseId } from "@/landing/content/useCases";
import { SmartImage } from "@/landing/ui/SmartImage";

/*
 * Tile shapes follow each photo's own shape, so crops stay small:
 *   clothing (landscape 4:3)  → big tile        jewellery (tall 2:3) → tall tile
 *   bakery (portrait 3:4)     → square tile     gifting (landscape 3:2) → square tile
 * Desktop: 4 columns × 2 rows.  Mobile: 2 columns (clothing full width, jewellery tall on the left).
 */
const TILES: {
  id: UseCaseId;
  label: string;
  /** Shorter caption for small phone tiles */
  short: string;
  photo: Photo;
  icon: LucideIcon;
  className: string;
  sizes: string;
}[] = [
  {
    id: "clothing",
    label: "Clothing and ethnic wear",
    short: "Clothing",
    photo: PHOTOS.clothing,
    icon: Shirt,
    className: "col-span-2 aspect-[4/3] lg:row-span-2 lg:aspect-auto",
    sizes: "(min-width: 1024px) 560px, 100vw",
  },
  {
    id: "jewellery",
    label: "Jewellery and accessories",
    short: "Jewellery",
    photo: PHOTOS.jewellery,
    icon: Gem,
    className: "row-span-2",
    sizes: "(min-width: 1024px) 272px, 50vw",
  },
  {
    id: "bakery",
    label: "Home bakers and food brands",
    short: "Home bakery",
    photo: PHOTOS.bakery,
    icon: CakeSlice,
    className: "aspect-square lg:aspect-auto",
    sizes: "(min-width: 1024px) 272px, 50vw",
  },
  {
    id: "gifting",
    label: "Handmade and gifting",
    short: "Gifting",
    photo: PHOTOS.gifting,
    icon: Gift,
    className: "aspect-square lg:aspect-auto",
    sizes: "(min-width: 1024px) 272px, 50vw",
  },
];

export function SellerUseCases() {
  return (
    <section aria-labelledby="sellers-title" className="section bg-alt">
      <div className="wrap">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[640px]">
            <h2 id="sellers-title" className="h2">
              Built for sellers who sell through conversations.
            </h2>
            <p className="lede mt-3">Clothing. Jewellery. Food. Handmade. Gifting.</p>
          </div>
          <p className="text-[14px] text-muted md:pb-1">Pick a card to see a sample order.</p>
        </div>

        <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:mt-10 lg:grid-cols-4 lg:grid-rows-[250px_250px]">
          {TILES.map((tile) => (
            <li key={tile.id} className={cn("relative", tile.className)}>
              <button
                type="button"
                onClick={() => showUseCase(tile.id)}
                className="photo-zoom group absolute inset-0 overflow-hidden rounded-card border border-line bg-surface text-left shadow-card"
              >
                <SmartImage photo={tile.photo} sizes={tile.sizes} fallbackIcon={tile.icon} decorative />
                <span className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 rounded-control bg-surface px-3 py-2 shadow-card sm:bottom-3 sm:left-3 sm:right-auto sm:max-w-[calc(100%-24px)]">
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold leading-snug text-ink">
                      <span className="sm:hidden">{tile.short}</span>
                      <span className="hidden sm:inline">{tile.label}</span>
                    </span>
                    <span className="sr-only sm:not-sr-only sm:block sm:text-[13px] sm:leading-snug sm:text-brand">See a sample order</span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-brand transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
