import { BookOpen, Clock, Copy, TriangleAlert, type LucideIcon } from "lucide-react";
import { PHOTOS } from "@/landing/content/photos";
import { SmartImage } from "@/landing/ui/SmartImage";

const POINTS: { icon: LucideIcon; text: string }[] = [
  { icon: Copy, text: "Names, addresses and sizes copied by hand, one order at a time." },
  { icon: TriangleAlert, text: "Small typos that turn into wrong deliveries and returns." },
  { icon: Clock, text: "Evenings lost to paperwork once orders pick up." },
];

export function Problem() {
  return (
    <section aria-labelledby="problem-title" className="section bg-alt">
      <div className="wrap grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
        <div>
          <h2 id="problem-title" className="h2">
            Every order gets typed twice.
          </h2>
          <p className="lede mt-4 max-w-[560px]">
            Your customer already wrote the order. Then you copy it again into a bill book, an Excel sheet or an
            invoicing app.
          </p>
          <ul className="mt-8 grid gap-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="card flex items-center gap-4 px-4 py-3.5">
                <span className="icon-tile" aria-hidden="true">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <p className="text-[16px] leading-[1.5] text-ink">{text}</p>
              </li>
            ))}
          </ul>
        </div>

        <figure className="relative mx-auto w-full max-w-[420px] lg:mr-0 lg:max-w-none lg:pl-[150px]">
          {/* Portrait photo shown at its own shape (2:3), so nothing is cut off. */}
          <div
            className="relative w-full overflow-hidden rounded-card border border-line bg-surface shadow-card"
            style={{ aspectRatio: `${PHOTOS.billBook.width} / ${PHOTOS.billBook.height}` }}
          >
            <SmartImage
              photo={PHOTOS.billBook}
              sizes="(min-width: 1024px) 400px, (min-width: 460px) 420px, calc(100vw - 40px)"
              fallbackIcon={BookOpen}
            />
          </div>

          <figcaption className="sr-only">
            A shopkeeper writing orders in a notebook, and an example of a handwritten bill where the quantity was
            corrected from 3 to 2 and the delivery charge was left out.
          </figcaption>

          {/* Mobile: sits under the photo with a small overlap. Desktop: overlaps only the shelves on the photo's left edge. */}
          <div
            aria-hidden="true"
            className="ruled relative -mt-8 ml-3 w-[260px] -rotate-2 rounded-control border border-[#e8e0cc] px-4 pb-3 pt-2 shadow-lift sm:w-[290px] lg:absolute lg:left-0 lg:top-1/2 lg:ml-0 lg:mt-0 lg:-translate-y-1/2"
          >
            <div className="hand text-[20px] leading-[30px] text-[#2b3a67] sm:text-[22px]">
              <p className="flex justify-between">
                <span>Bill no. 141</span>
                <span>23/9</span>
              </p>
              <p>Rohini Sharma, Delhi</p>
              <p className="flex justify-between gap-3">
                <span>
                  Kurta blue M × <span className="mx-0.5 text-[#b42318] line-through decoration-2">3</span> 2
                </span>
                <span>2598</span>
              </p>
              <p className="flex justify-between gap-3">
                <span>Dupatta white × 1</span>
                <span>599</span>
              </p>
              <p className="flex justify-between gap-3 font-semibold">
                <span>Total</span>
                <span className="border-b-2 border-[#2b3a67]">3197</span>
              </p>
              <p className="-mt-1 rotate-[-3deg] text-right text-[18px] text-[#b42318] sm:text-[19px]">
                delivery ₹99 bhool gaye?
              </p>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
