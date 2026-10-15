/*
 * Matching what the customer wrote ("blue wala kurta", "kurtas") to the seller's products.
 * The AI suggests a product; this is the second opinion used when it doesn't, and to sanity-check it.
 */

import type { Product } from "../types";

const STOP = new Set([
  "wala", "wali", "wale", "the", "a", "an", "of", "and", "aur", "bhi", "chahiye", "please", "pls", "plz", "size",
  "colour", "color", "piece", "pieces", "pc", "pcs", "ka", "ki", "ke", "for", "with", "in", "one", "ek", "do", "x",
]);

/** Lowercase words with simple plural endings removed: "Kurtas" -> "kurta", "kurte" -> "kurta". */
export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
    .map((w) => {
      if (w.length > 4 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
      if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
      if (w.length > 3 && w.endsWith("e")) return `${w.slice(0, -1)}a`; // kurte -> kurta, saree stays sarea~saree below
      return w;
    });
}

function bigrams(w: string): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < w.length - 1; i++) s.add(w.slice(i, i + 2));
  return s;
}

function wordSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 3 || b.length < 3) return 0;
  if (a.startsWith(b) || b.startsWith(a)) return 0.85;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  A.forEach((x) => B.has(x) && inter++);
  return (2 * inter) / (A.size + B.size);
}

/** 0..1: how well the customer's words cover the product name. */
export function similarity(customerText: string, productName: string): number {
  const c = tokens(customerText);
  const p = tokens(productName);
  if (!c.length || !p.length) return 0;
  // How much of the product name the customer's words cover (main signal)...
  const cover = p.map((pw) => Math.max(...c.map((cw) => wordSim(cw, pw))));
  const strong = cover.filter((x) => x >= 0.8).length;
  const productCover = cover.reduce((s, x) => s + x, 0) / p.length;
  // ...and how much of what the customer wrote the product explains (breaks ties: "kurta set" -> Kurta Set).
  const customerCover = c.map((cw) => Math.max(...p.map((pw) => wordSim(cw, pw)))).reduce((s, x) => s + x, 0) / c.length;
  const score = 0.85 * productCover + 0.15 * customerCover;
  return strong === 0 ? score * 0.6 : score;
}

export interface MatchResult {
  product: Product;
  score: number;
}

export function bestMatch(text: string, products: Product[]): MatchResult | null {
  let best: MatchResult | null = null;
  for (const p of products) {
    if (p.archived) continue;
    const names = [p.name, ...p.aliases.split(",").map((a) => a.trim()).filter(Boolean)];
    const score = Math.max(...names.map((n) => similarity(text, n)));
    if (!best || score > best.score) best = { product: p, score };
  }
  return best;
}

export const STRONG_MATCH = 0.8;
export const WEAK_MATCH = 0.55;
