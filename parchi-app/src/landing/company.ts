/*
 * Who runs Parchi. Shown on the Terms, Privacy, Refunds, Delivery and Contact pages and in the footer.
 * Razorpay checks that these match the KYC on your Razorpay account (name, contact, address).
 *
 * A test (tests/company.test.ts) fails while any required field is empty, so the site can't be packaged
 * with missing details.
 */

export const COMPANY = {
  /** Product name customers see */
  brand: "Parchi",
  /** The person named on the Razorpay account */
  legalName: "Yash Dhariwal",
  /** Support email shown to customers */
  email: "parchicontact@gmail.com",
  /** Support phone shown to customers. Optional: leave empty to show email only. */
  phone: "",
  /** Full postal address */
  address: "Tower C, DLF Cyber Park, Phase II, Udyog Vihar, Sector 20, Gurugram, Haryana 122008, India",
  /** City for the courts clause in the Terms */
  city: "Gurugram",
  /** Only if registered for GST, e.g. "07ABCDE1234F1Z5". Leave empty otherwise. */
  gstin: "",
  /** Support hours shown on the Contact page. Optional. */
  hours: "",
  /** Date the policies were last updated, shown on each page */
  policiesUpdated: "15 October 2026",
};

export const REQUIRED_COMPANY_FIELDS = ["legalName", "email", "address", "city"] as const;

export function missingCompanyFields(): string[] {
  return REQUIRED_COMPANY_FIELDS.filter((k) => !COMPANY[k].trim());
}

/** "Email x" or "Email x, phone y": how to reach us, in one phrase. */
export function reachUs(): string {
  return COMPANY.phone.trim() ? `email ${COMPANY.email}, phone ${COMPANY.phone}` : `email ${COMPANY.email}`;
}

/** For the pages: a field's value, or a visible marker while it hasn't been filled in. */
export function co(k: keyof typeof COMPANY): string {
  return COMPANY[k].trim() || `[${k} not set]`;
}
