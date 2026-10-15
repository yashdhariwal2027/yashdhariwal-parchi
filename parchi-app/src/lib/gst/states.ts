/*
 * GST state codes (as used in GSTINs and for "place of supply").
 * `ut: true` marks Union Territories without a legislature, where UTGST is charged instead of SGST.
 * Delhi, Puducherry and Jammu & Kashmir have legislatures, so they charge SGST.
 */

export interface GstState {
  code: string;
  name: string;
  ut: boolean;
  /** Other ways people write the name */
  aliases?: string[];
}

export const STATES: GstState[] = [
  { code: "01", name: "Jammu and Kashmir", ut: false, aliases: ["j&k", "jammu & kashmir", "jammu", "kashmir", "srinagar"] },
  { code: "02", name: "Himachal Pradesh", ut: false, aliases: ["hp", "himachal", "shimla"] },
  { code: "03", name: "Punjab", ut: false, aliases: ["ludhiana", "amritsar", "jalandhar", "mohali"] },
  { code: "04", name: "Chandigarh", ut: true },
  { code: "05", name: "Uttarakhand", ut: false, aliases: ["uttaranchal", "dehradun", "uk"] },
  { code: "06", name: "Haryana", ut: false, aliases: ["gurgaon", "gurugram", "faridabad", "panipat", "sonipat"] },
  { code: "07", name: "Delhi", ut: false, aliases: ["new delhi", "nct of delhi", "dilli", "ncr delhi"] },
  { code: "08", name: "Rajasthan", ut: false, aliases: ["jaipur", "jodhpur", "udaipur", "raj"] },
  { code: "09", name: "Uttar Pradesh", ut: false, aliases: ["up", "u.p.", "noida", "greater noida", "ghaziabad", "lucknow", "kanpur", "varanasi", "agra"] },
  { code: "10", name: "Bihar", ut: false, aliases: ["patna"] },
  { code: "11", name: "Sikkim", ut: false, aliases: ["gangtok"] },
  { code: "12", name: "Arunachal Pradesh", ut: false, aliases: ["arunachal"] },
  { code: "13", name: "Nagaland", ut: false },
  { code: "14", name: "Manipur", ut: false, aliases: ["imphal"] },
  { code: "15", name: "Mizoram", ut: false },
  { code: "16", name: "Tripura", ut: false },
  { code: "17", name: "Meghalaya", ut: false, aliases: ["shillong"] },
  { code: "18", name: "Assam", ut: false, aliases: ["guwahati"] },
  { code: "19", name: "West Bengal", ut: false, aliases: ["wb", "kolkata", "calcutta", "bengal", "howrah", "siliguri"] },
  { code: "20", name: "Jharkhand", ut: false, aliases: ["ranchi", "jamshedpur"] },
  { code: "21", name: "Odisha", ut: false, aliases: ["orissa", "bhubaneswar", "cuttack"] },
  { code: "22", name: "Chhattisgarh", ut: false, aliases: ["raipur"] },
  { code: "23", name: "Madhya Pradesh", ut: false, aliases: ["mp", "m.p.", "indore", "bhopal"] },
  { code: "24", name: "Gujarat", ut: false, aliases: ["ahmedabad", "surat", "vadodara", "baroda", "rajkot"] },
  {
    code: "26",
    name: "Dadra and Nagar Haveli and Daman and Diu",
    ut: true,
    aliases: ["daman", "diu", "silvassa", "dadra", "dnh"],
  },
  { code: "27", name: "Maharashtra", ut: false, aliases: ["mumbai", "bombay", "pune", "thane", "navi mumbai", "nagpur", "nashik", "mh"] },
  { code: "29", name: "Karnataka", ut: false, aliases: ["bengaluru", "bangalore", "mysuru", "mysore", "ka"] },
  { code: "30", name: "Goa", ut: false, aliases: ["panaji", "margao"] },
  { code: "31", name: "Lakshadweep", ut: true },
  { code: "32", name: "Kerala", ut: false, aliases: ["kochi", "cochin", "trivandrum", "thiruvananthapuram", "kozhikode"] },
  { code: "33", name: "Tamil Nadu", ut: false, aliases: ["tn", "chennai", "madras", "coimbatore", "madurai"] },
  { code: "34", name: "Puducherry", ut: false, aliases: ["pondicherry", "pondy"] },
  { code: "35", name: "Andaman and Nicobar Islands", ut: true, aliases: ["andaman", "port blair"] },
  { code: "36", name: "Telangana", ut: false, aliases: ["hyderabad", "secunderabad", "ts"] },
  { code: "37", name: "Andhra Pradesh", ut: false, aliases: ["ap", "vijayawada", "visakhapatnam", "vizag", "guntur"] },
  { code: "38", name: "Ladakh", ut: true, aliases: ["leh"] },
  { code: "97", name: "Other Territory", ut: true },
];

const BY_CODE = new Map(STATES.map((s) => [s.code, s]));

export function stateByCode(code: string | null | undefined): GstState | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

export function stateLabel(code: string | null | undefined): string {
  const s = stateByCode(code);
  return s ? `${s.name} (${s.code})` : "";
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Finds a state from a name, common abbreviation or major city ("Bangalore" -> Karnataka). */
export function findState(text: string | null | undefined): GstState | undefined {
  if (!text) return undefined;
  const t = norm(text);
  if (!t) return undefined;
  if (/^\d{2}$/.test(t)) return BY_CODE.get(t);
  for (const s of STATES) {
    if (norm(s.name) === t) return s;
    if (s.aliases?.some((a) => norm(a) === t)) return s;
  }
  return undefined;
}

/*
 * PIN code to state, by the first three digits. Ranges follow India Post's postal circles.
 * Used only as a hint: the seller always confirms the state before issuing.
 */
const PIN_RANGES: [number, number, string][] = [
  [110, 110, "07"],
  [121, 136, "06"],
  [140, 147, "03"],
  [148, 159, "03"],
  [160, 160, "04"],
  [171, 177, "02"],
  [180, 193, "01"],
  [194, 194, "38"],
  [201, 285, "09"],
  [246, 249, "05"],
  [262, 263, "05"],
  [301, 345, "08"],
  [360, 396, "24"],
  [400, 445, "27"],
  [403, 403, "30"],
  [450, 488, "23"],
  [490, 497, "22"],
  [500, 509, "36"],
  [515, 535, "37"],
  [560, 591, "29"],
  [600, 643, "33"],
  [605, 605, "34"],
  [670, 695, "32"],
  [682, 682, "32"],
  [700, 743, "19"],
  [737, 737, "11"],
  [744, 744, "35"],
  [751, 770, "21"],
  [781, 788, "18"],
  [790, 792, "12"],
  [793, 794, "17"],
  [795, 795, "14"],
  [796, 796, "15"],
  [797, 798, "13"],
  [799, 799, "16"],
  [800, 855, "10"],
  [814, 816, "20"],
  [822, 835, "20"],
];

/** Returns the most specific matching range (narrowest), or undefined. */
export function stateFromPin(pin: string | null | undefined): GstState | undefined {
  if (!pin || !/^[1-9]\d{5}$/.test(pin)) return undefined;
  const p3 = Number(pin.slice(0, 3));
  let best: [number, number, string] | undefined;
  for (const r of PIN_RANGES) {
    if (p3 >= r[0] && p3 <= r[1] && (!best || r[1] - r[0] < best[1] - best[0])) best = r;
  }
  // Some blocks are shared (160 is Chandigarh and Mohali, 396 is Valsad and Daman, 605 is Puducherry and
  // Villupuram), so the result is only ever a suggestion.
  return best ? BY_CODE.get(best[2]) : undefined;
}
