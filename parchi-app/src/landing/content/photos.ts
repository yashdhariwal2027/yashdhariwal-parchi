/*
 * Photos used on the page.
 *
 * All are free photos from Unsplash (Unsplash License: free for commercial use, no attribution required).
 * They load from Unsplash's image CDN, which resizes and converts them (WebP/AVIF) on the fly.
 * Photos are never cropped on the server; each frame shows the photo with CSS `object-fit: cover`,
 * and `focus` says which part of the photo must stay visible (e.g. a face), as an object-position.
 *
 * To use your own photo: put the file in /public/images/ (e.g. /public/images/clothing.webp),
 * set `src` to "/images/clothing.webp", and update `width`/`height`/`alt`.
 * If a photo ever fails to load, a neutral tile is shown instead of a broken image.
 */

export interface Photo {
  src: string;
  alt: string;
  /** Original pixel size, used for the correct aspect ratio */
  width: number;
  height: number;
  /** CSS object-position: the point that must stay in frame when the frame crops the photo */
  focus: string;
  /** Credit for your records. Not shown on the page. */
  credit: string;
}

export const PHOTOS = {
  clothing: {
    src: "https://images.unsplash.com/photo-1646578486121-67aed93c4f4e",
    alt: "A seller sitting in front of a display of colourful fabrics",
    width: 5120,
    height: 3840,
    // face centre at 51% across, 43% down
    focus: "50% 40%",
    credit: "atarin michaeli on Unsplash, unsplash.com/photos/TGReb6gIs3o",
  },
  jewellery: {
    src: "https://images.unsplash.com/photo-1785533692950-cab077292bf6",
    alt: "Hands with red mehndi holding pearl necklaces over an embroidered garment",
    width: 3929,
    height: 5893,
    focus: "50% 50%",
    credit: "Uday Ahir on Unsplash, unsplash.com/photos/G5l7o5baEMI",
  },
  bakery: {
    src: "https://images.unsplash.com/photo-1758910536889-43ce7b3199fd",
    alt: "Trays of colourful Indian sweets on display",
    width: 3024,
    height: 4032,
    focus: "50% 50%",
    credit: "Sadia Alam on Unsplash, unsplash.com/photos/3zgia9k593w",
  },
  gifting: {
    src: "https://images.unsplash.com/photo-1788713756143-fcfc915940f0",
    alt: "A hand holding a small brown paper package tied with colourful string",
    width: 5618,
    height: 3848,
    focus: "50% 50%",
    credit: "Liana S on Unsplash, unsplash.com/photos/zYPixh1jN9w",
  },
  billBook: {
    src: "https://images.unsplash.com/photo-1763475945531-7241e0015363",
    alt: "A shopkeeper in a sari writing in a notebook at her desk",
    width: 2731,
    height: 4096,
    // portrait photo, face at 58% across, 28% down; shown uncropped
    focus: "50% 30%",
    credit: "Lens Fables on Unsplash, unsplash.com/photos/hDb2CmhQ5jc",
  },
  waitlist: {
    src: "https://images.unsplash.com/photo-1779470703519-05af825e87cd",
    alt: "Colourful patterned scarves and textiles stacked on shelves",
    width: 4000,
    height: 5333,
    focus: "50% 50%",
    credit: "Sounak Mukherjee on Unsplash, unsplash.com/photos/bsxCeDUuprM",
  },
} satisfies Record<string, Photo>;
