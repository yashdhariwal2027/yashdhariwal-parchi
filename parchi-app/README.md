# Parchi app

Paste a customer's WhatsApp or Instagram order message, and Parchi turns it into a GST-correct invoice you can send back on WhatsApp.

- **Reads the order with Gemini.** It runs on the server, so the API key never reaches the browser. Phone numbers are read on the device and are never sent to the AI.
- **Uses the seller's product list** for prices, HSN codes and GST rates. Anything the AI wasn't sure about is highlighted as **Check**, and the invoice can't be issued until the seller confirms it.
- **Makes the right document for the seller's GST registration:**
  - Regular registration: **Tax Invoice** with CGST + SGST (or UTGST) inside the state, IGST across states.
  - Composition scheme: **Bill of Supply** with the required declaration.
  - Not registered: a plain **Invoice**.
- **Numbers invoices like GST requires.** Numbers are consecutive, restart every financial year, are at most 16 characters (`INV/26-27/0001`) and are never reused. Issued invoices are locked and can only be cancelled.
- **Sends on WhatsApp.** On phones the PDF is attached through the share sheet. On computers the PDF downloads and WhatsApp opens with a message.
- Also included: UPI scan-to-pay QR, paid/unpaid tracking, and CA exports (invoice register and HSN summary as CSV).
- Accounts and data are in **Supabase**: Postgres with Row Level Security, so each seller only ever sees their own data.

Stack: React 19, TypeScript, Vite, Tailwind (same look as the landing page), Supabase, Gemini API, Dodo Payments, @react-pdf/renderer, hosted on Cloudflare Pages (static site plus two Pages Functions: `functions/api/parse.ts` and `functions/api/billing.ts`).

---

## 1. Set up Supabase (about 10 minutes)

1. Go to [supabase.com](https://supabase.com), create an account and a **New project**. For **Region**, pick **Mumbai (ap-south-1)**: it's faster for Indian sellers and keeps data in India. Save the database password somewhere safe.
2. Open **SQL Editor > New query**. Paste the whole of `supabase/migrations/20261015000000_parchi_init.sql` and click **Run**. You should see "Success. No rows returned".
3. Open **Authentication > Sign In / Providers > Email** and make sure Email is enabled.
   - **For the pilot, turn off "Confirm email".** Supabase's built-in email service only sends to members of your Supabase team, at about 2 emails an hour, so sellers wouldn't receive confirmation emails.
   - To get confirmation and "Forgot password" emails working for everyone, set up custom SMTP under **Authentication > Emails > SMTP Settings** (for example Resend or Brevo, both of which have free plans). You can then turn "Confirm email" back on.
4. Open **Authentication > URL Configuration**:
   - **Site URL**: your domain, e.g. `https://yourdomain.com` (step 3)
   - **Redirect URLs**: add `https://yourdomain.com/**`
5. Open **Project Settings > API Keys** (on older dashboards, **Settings > API**). Copy the **Project URL** and the **Publishable key**; both are safe in the browser. The **secret key** (`sb_secret_...`) is only ever set as a server secret for payments (section 5), never in a `VITE_` variable.

## 2. Get a Gemini API key (2 minutes)

1. Go to [aistudio.google.com](https://aistudio.google.com) and click **Get API key > Create API key**.
2. **Before real sellers use it, turn on billing for that Google Cloud project.** On the free tier, Google may use what you send to improve its products. Here that means your sellers' customers' names and addresses. On the paid tier, it doesn't. Each order costs a fraction of a rupee, but check the current [pricing](https://ai.google.dev/gemini-api/docs/pricing).
3. The app uses `gemini-3.8-flash` by default. To use a different model, set `GEMINI_MODEL` (for example `gemini-3.5-flash-lite`, which is cheaper).

## 3. Host on Cloudflare Pages (free) with your own domain

Cloudflare's free plan has no non-commercial restriction (Vercel's free Hobby plan does). Static pages are free and unlimited; the two server functions get 100,000 requests a day and 10 ms of CPU per request free (Parchi's functions use about 1 to 7 ms). Card and UPI details are entered on Dodo Payments' own checkout page, never on this site.

1. **Domain.** In the Cloudflare dashboard, open **Domain Registration > Register Domains**, search for a name and buy it. Cloudflare sells at cost with no markup, and its DNS and SSL are set up automatically.
2. **Connect GitHub.** **Workers & Pages > Create > Pages > Connect to Git**, pick the repository, then:
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: the folder that holds `package.json` (e.g. `parchi-app`)
3. **Variables** (Settings > Variables and Secrets, for Production). Add as **Text**: `NODE_VERSION` = `22`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Add as **Secret**: `GEMINI_API_KEY` (and the payment ones in section 5).
4. **Deploy.** The site appears at `https://<project>.pages.dev`.
5. **Custom domain.** Project > **Custom domains > Set up a custom domain**: add `yourdomain.com`, then also `www.yourdomain.com` (the app sends www. visitors to the address without it, so sign-ins stay in one place).
6. Put `https://yourdomain.com` in Supabase's **Site URL** and **Redirect URLs** (step 1.4).

`VITE_` values are baked in when the site is built, so after changing one, redeploy (**Deployments > ⋯ > Retry deployment**). Secrets take effect on the next deployment too.

## 4. First live check (please do this before inviting sellers)

These are the parts that could only be tested against stand-ins here, because Supabase and Gemini can't be reached from where it was built:

1. **Sign up** with a new email. You should land on "Set up your business". If you see "Check your inbox" instead, turn off "Confirm email" (step 1.3).
2. **Set up a business** as Regular GST, using any valid GSTIN (for testing, `07AAPFU0939F1ZX` is a valid-format Delhi GSTIN). Then **add two products**, e.g. Kurta ₹1,299 (HSN 6204, Clothing/footwear) and Dupatta ₹599 (HSN 6214, Clothing/footwear).
3. On **New invoice**, paste this and tap **Read order**:
   ```
   Hi! 2 kurtas chahiye, blue wala, M size.
   Aur 1 white dupatta bhi.
   Rohini Sharma, H-14, Sector 9, Rohini, Delhi 110085
   98765 43210
   COD chalega?
   ```
   Expected result: customer Rohini Sharma, phone +91 98765 43210, Delhi, Kurta × 2 (Blue, M) and Dupatta × 1 (White), total **₹3,197.00** with CGST and SGST ₹76.12 each. Add ₹99 delivery and the total becomes ₹3,296.00.
   - "Order reading isn't set up yet": `GEMINI_API_KEY` is missing. Add it and redeploy.
   - Before this works, give yourself a pass (section 5, step 3): without one, Parchi asks you to choose a plan.
   - "The Gemini model isn't available": set `GEMINI_MODEL` to a model listed in AI Studio.
4. **Issue** the invoice. It should become `INV/26-27/0001`. Tap **Send on WhatsApp** on your phone; the share sheet should offer WhatsApp with the PDF attached.
5. Paste **10 to 20 of the real order messages you collected** and note anything Parchi gets wrong. Those notes are what will improve the instructions in `api/parse.ts` (`SYSTEM_PROMPT`).

## 5. Start selling: plans and Dodo Payments

Sellers pay for a 30-day pass before they can make invoices: **Starter ₹249** (100 invoices), **Growth ₹349** (250) or **Pro ₹499** (500), GST included. Nothing renews automatically and passes aren't refundable once started. Dodo Payments is the merchant of record: it collects the payment, charges the GST inside the price and issues the buyer's tax invoice. The pages Dodo may check are `/pricing`, `/terms`, `/privacy`, `/refunds`, `/shipping` and `/contact`.

1. **Business details** are in `src/landing/company.ts`. A test fails if a required one is empty.
2. **Database.** Already set up by `supabase/migrations/20261016000000_parchi_billing.sql`. Nothing new to run for Dodo.
3. **Products in Dodo** (Test Mode first): create three **one-time** products priced in **INR** with **Tax Inclusive Pricing** on: Starter 249, Growth 349, Pro 499. Copy each product ID (`pdt_...`).
4. **API key**: Dodo > Developer > API Keys.
5. **Webhook**: Dodo > Developer > Webhooks > Add endpoint, URL `https://yourdomain.com/api/billing?action=webhook`, event `payment.succeeded`. Copy the signing secret (`whsec_...`).
6. **Cloudflare variables**: Secrets `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`; Text `DODO_MODE` = `test`, `DODO_PRODUCT_STARTER`, `DODO_PRODUCT_GROWTH`, `DODO_PRODUCT_PRO`. Plus `SUPABASE_SECRET_KEY` (Secret) if not already there. Redeploy.
7. **Test** with a new account and Dodo's test card.
8. **Go live** once Dodo approves the account: redo steps 3 to 5 in Live Mode, replace the five Dodo values in Cloudflare, set `DODO_MODE` = `live`, redeploy.

Notes:
- **Prices** live in three places that must match: `billing_plan` in the SQL file (what's enforced), `PLANS` in `api/billing.ts`, and `src/lib/plans.ts` (what's shown).
- **Payment problems** (charged twice, or charged without a pass) are refunded from the Dodo dashboard.
- `GEMINI_API_BASE` and `DODO_API_BASE` exist only for automated tests. Never set them in Cloudflare.

## 6. Run on your computer (optional)

Needs Node.js 20.19+ (`node -v`).

```bash
npm install
cp .env.example .env.local      # fill in the three values
npm run dev                     # http://localhost:5173 (also serves /api/parse locally)
npm test                        # unit tests: GST maths, GSTIN, parsing, PDF, payments
npm run build                   # type-check and build
```

---

## How the GST rules are applied

Please have your CA review these before the pilot. They're also written as comments in `src/lib/gst/calc.ts` and `src/lib/invoice/draft.ts`.

| Topic | What Parchi does |
|---|---|
| Document type | Regular: Tax Invoice. Composition: Bill of Supply with "Composition taxable person, not eligible to collect tax on supplies". Not registered: Invoice. A regular seller selling only 0% items gets a Bill of Supply. Taxed plus exempt items to an unregistered buyer gives an Invoice-cum-Bill of Supply (Rule 46A). |
| Particulars (Rule 46) | Seller name, address and GSTIN; consecutive number up to 16 characters, unique per financial year; date; buyer name, address, state and code, and GSTIN if given; HSN; description; quantity with unit (UQC); taxable value after discount; rate; CGST/SGST/UTGST/IGST amounts; place of supply with state; reverse charge (No); signature block. |
| Place of supply | Delivery state by default (IGST Act s.10(1)(a)). When the buyer gives a GSTIN, it defaults to the GSTIN's state (bill-to/ship-to, s.10(1)(b)), with a note if delivery is elsewhere. The seller can change it. |
| CGST/SGST vs IGST | Same state as the seller: CGST + SGST, or UTGST in Chandigarh, Ladakh, Lakshadweep, Andaman & Nicobar and Dadra & Nagar Haveli and Daman & Diu. Otherwise IGST. |
| GST-inclusive prices | GST is backed out of the price, so each line totals exactly the price the customer was quoted. CGST and SGST are kept equal, so an odd paisa goes into the taxable value. |
| Clothing and footwear | 5% when the value per piece is up to ₹2,500, 18% above (rates from 22 Sep 2025). With inclusive prices, the per-piece value is tested at 5%. **Ask your CA** about prices between ₹2,625 and ₹2,950 inclusive, where practice differs. |
| Delivery charges | Taxed as part of a composite supply, at the goods' rate; the highest rate when items differ. Shown under the main item's HSN. |
| Rounding | Tax per line to the paisa, invoice total rounded to the rupee with a Round off line. |
| HSN | Required on every line of tax invoices and bills of supply (also needed for GSTR-1 Table 12). 4, 6 or 8 digits. Sellers with turnover over ₹5 crore need 6 digits. |
| Numbering | `PREFIX/YY-YY/NNNN`, one series per financial year (April to March). Numbers must follow date order, so an invoice can't be dated before the last one issued. Failed attempts don't use up numbers. Cancelled numbers are kept, never reused. |
| Issued invoices | Locked by the database. Only paid/unpaid can change, or the invoice can be cancelled with a reason. The cancel screen warns that if the invoice is already in GSTR-1, a credit note is needed instead. |
| Warnings | Inter-state sales by unregistered or composition sellers (generally not allowed for goods); ₹50,000+ to an unregistered buyer needs address and state (Rule 46); e-way bill reminder above ₹50,000. |
| Not covered yet | Credit/debit notes, e-invoicing (IRN, mandatory for B2B above ₹5 crore turnover), e-way bills, TCS by e-commerce operators, multiple GSTINs per account, services (SAC). |

## Data and privacy

- Each seller's business details, products and invoices are in their Supabase project rows, protected by Row Level Security (tested: a second account sees nothing).
- The order message itself is **not stored**. Phone numbers never go to Gemini.
- Customer names and addresses do go to Gemini to be read. Use the paid tier (section 2).
- Under India's DPDP Act, your sellers are responsible for their customers' data and you process it for them. Before the pilot, publish a short privacy notice and terms that say what you store, why, and how a seller can get their data deleted. Deleting a user in Supabase (**Authentication > Users**) deletes all their data. GST law also expects invoices to be kept for 6 years, so tell sellers to download their records first.

## Limits worth knowing

- **AI reading limit:** 150 orders per seller per day. This protects your Gemini bill. Change `v_limit` in `consume_parse_quota` in the SQL.
- **Logos and signatures** are shrunk on the device and stored in the business row. No storage bucket is needed.
- **Unsaved work** is kept on the device, so a reload doesn't lose a half-made invoice.

## Project structure

```
api/parse.ts                    Serverless function: auth + daily limit (Supabase), Gemini call, output validation
supabase/migrations/*.sql       Tables, Row Level Security, issue_invoice() numbering, locks, AI usage limit
src/lib/gst/                    GST maths, states and codes, GSTIN checksum, amount in words, dates
src/lib/invoice/                Draft model, checks before issuing, printed invoice model, CA exports
src/lib/parse/                  Phone/PIN reading on the device, product matching
src/lib/pdf/                    PDF (A4) and WhatsApp sharing
src/pages/                      Sign in, setup, new invoice, invoices, invoice, products, settings
public/fonts/                   Inter (with ₹) for the PDF, SIL Open Font License
tests/                          Unit tests (npm test)
```
