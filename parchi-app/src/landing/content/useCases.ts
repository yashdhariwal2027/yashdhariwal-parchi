/*
 * Sample orders shown in the interactive demo. All names, numbers and businesses are fictional.
 * Phone numbers are masked on purpose.
 */

export type UseCaseId = "clothing" | "jewellery" | "bakery" | "gifting";
export type RevealKey = "item-0" | "item-1" | "billTo" | "payment" | "note";

export interface MessagePart {
  text: string;
  /** Segment id that gets highlighted when this part is "read" */
  seg?: string;
}

export interface UseCase {
  id: UseCaseId;
  tab: string;
  customer: { name: string; initials: string };
  time: string;
  /** One array per line of the chat message */
  message: MessagePart[][];
  seller: string;
  invoiceNo: string;
  date: string;
  billTo: string[];
  items: { name: string; qty: number; rate: number }[];
  delivery: number;
  payment: string;
  note?: { label: string; value: string };
  /** Reading order: highlight `seg`, then reveal `reveal` on the invoice */
  steps: { seg: string; reveal: RevealKey }[];
  reply: string;
}

export const USE_CASES: UseCase[] = [
  {
    id: "clothing",
    tab: "Clothing",
    customer: { name: "Rohini Sharma", initials: "RS" },
    time: "7:42 pm",
    message: [
      [{ text: "Hi! " }, { text: "2 kurtas chahiye, blue wala, M size", seg: "a" }, { text: "." }],
      [{ text: "Aur " }, { text: "1 white dupatta", seg: "b" }, { text: " bhi." }],
      [{ text: "Rohini Sharma, H-14, Sector 9, Rohini, Delhi 110085", seg: "c" }],
      [{ text: "98XXX XXX12", seg: "c" }],
      [{ text: "COD chalega?", seg: "d" }],
    ],
    seller: "Noor Studio",
    invoiceNo: "INV-0142",
    date: "23 Sep 2026",
    billTo: ["Rohini Sharma", "H-14, Sector 9, Rohini, Delhi 110085", "+91 98XXX XXX12"],
    items: [
      { name: "Kurta, Blue, Size M", qty: 2, rate: 1299 },
      { name: "Dupatta, White", qty: 1, rate: 599 },
    ],
    delivery: 99,
    payment: "Cash on delivery",
    steps: [
      { seg: "a", reveal: "item-0" },
      { seg: "b", reveal: "item-1" },
      { seg: "c", reveal: "billTo" },
      { seg: "d", reveal: "payment" },
    ],
    reply: "Here's your invoice. We'll dispatch tomorrow. Thank you for shopping with Noor Studio!",
  },
  {
    id: "jewellery",
    tab: "Jewellery",
    customer: { name: "Priya Nair", initials: "PN" },
    time: "11:08 am",
    message: [
      [{ text: "Hello! Saw your reel. " }, { text: "2 pairs of the oxidised jhumkas", seg: "a" }, { text: " please" }],
      [{ text: "+ " }, { text: "1 silver anklet, 10 inch", seg: "b" }],
      [{ text: "Ship to Priya Nair, 22 Lake View Road, Kochi 682016", seg: "c" }],
      [{ text: "Ph 97XXX XXX08", seg: "c" }],
      [{ text: "Will pay by UPI now", seg: "d" }],
    ],
    seller: "Zoya Silver",
    invoiceNo: "INV-0217",
    date: "23 Sep 2026",
    billTo: ["Priya Nair", "22 Lake View Road, Kochi 682016", "+91 97XXX XXX08"],
    items: [
      { name: "Oxidised jhumka (pair)", qty: 2, rate: 649 },
      { name: "Silver anklet, 10 in", qty: 1, rate: 899 },
    ],
    delivery: 0,
    payment: "UPI, paid in advance",
    steps: [
      { seg: "a", reveal: "item-0" },
      { seg: "b", reveal: "item-1" },
      { seg: "c", reveal: "billTo" },
      { seg: "d", reveal: "payment" },
    ],
    reply: "Payment received, thank you! Your jhumkas and anklet ship today.",
  },
  {
    id: "bakery",
    tab: "Home bakery",
    customer: { name: "Kavya Iyer", initials: "KI" },
    time: "9:15 pm",
    message: [
      [{ text: "Hi Meera! " }, { text: "1 kg chocolate truffle cake", seg: "a" }, { text: " for Saturday" }],
      [{ text: "Write " }, { text: "“Happy 30th Arjun”", seg: "e" }, { text: " on it" }],
      [{ text: "and " }, { text: "a box of 12 brownies", seg: "b" }],
      [{ text: "Deliver to Kavya Iyer, Flat 4B, Sunrise Apts, Baner, Pune 411045", seg: "c" }],
      [{ text: "Sending 50% advance on UPI", seg: "d" }],
    ],
    seller: "Meera's Bakehouse",
    invoiceNo: "INV-0088",
    date: "23 Sep 2026",
    billTo: ["Kavya Iyer", "Flat 4B, Sunrise Apts, Baner, Pune 411045", "Delivery: Saturday, 26 Sep"],
    items: [
      { name: "Chocolate truffle cake, 1 kg", qty: 1, rate: 1450 },
      { name: "Brownies, box of 12", qty: 1, rate: 720 },
    ],
    delivery: 80,
    payment: "UPI, 50% advance",
    note: { label: "Message on cake", value: "Happy 30th Arjun" },
    steps: [
      { seg: "a", reveal: "item-0" },
      { seg: "e", reveal: "note" },
      { seg: "b", reveal: "item-1" },
      { seg: "c", reveal: "billTo" },
      { seg: "d", reveal: "payment" },
    ],
    reply: "Done! Invoice attached. The cake will reach you on Saturday afternoon.",
  },
  {
    id: "gifting",
    tab: "Gifting",
    customer: { name: "Aditya Rao", initials: "AR" },
    time: "4:30 pm",
    message: [
      [{ text: "Hey, need " }, { text: "3 personalised diaries", seg: "a" }],
      [{ text: "Names: " }, { text: "Aanya, Kabir, Rehan", seg: "e" }],
      [{ text: "Please " }, { text: "gift wrap all 3", seg: "b" }],
      [{ text: "Aditya Rao, 7 Brigade Road, Bengaluru 560001", seg: "c" }],
      [{ text: "COD pls", seg: "d" }],
    ],
    seller: "Kaagaz & Co.",
    invoiceNo: "INV-0319",
    date: "23 Sep 2026",
    billTo: ["Aditya Rao", "7 Brigade Road, Bengaluru 560001", "Gift order"],
    items: [
      { name: "Personalised diary", qty: 3, rate: 549 },
      { name: "Gift wrap", qty: 3, rate: 50 },
    ],
    delivery: 99,
    payment: "Cash on delivery",
    note: { label: "Names to print", value: "Aanya, Kabir, Rehan" },
    steps: [
      { seg: "a", reveal: "item-0" },
      { seg: "e", reveal: "note" },
      { seg: "b", reveal: "item-1" },
      { seg: "c", reveal: "billTo" },
      { seg: "d", reveal: "payment" },
    ],
    reply: "Here's your invoice. All three diaries will be gift wrapped with the names printed.",
  },
];

export const USE_CASE_EVENT = "parchi:show-use-case";

/** Ask the demo to switch to a use case and scroll it into view. */
export function showUseCase(id: UseCaseId) {
  window.dispatchEvent(new CustomEvent<UseCaseId>(USE_CASE_EVENT, { detail: id }));
}

export function formatINR(value: number) {
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}
