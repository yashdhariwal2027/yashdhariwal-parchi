import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPANY, missingCompanyFields } from "../src/landing/company";

// Razorpay checks the website's policy pages against your KYC, and customers need a way to reach you.
// This fails until src/landing/company.ts is filled in, so the site isn't published with blanks.
test("business details for the policy and contact pages are filled in", () => {
  assert.deepEqual(missingCompanyFields(), [], `Fill these in src/landing/company.ts: ${missingCompanyFields().join(", ")}`);
  assert.match(COMPANY.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, "support email looks wrong");
  if (COMPANY.phone.trim()) assert.ok(COMPANY.phone.replace(/\D/g, "").length >= 10, "support phone looks wrong");
  if (COMPANY.gstin) assert.match(COMPANY.gstin, /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "GSTIN looks wrong");
});
