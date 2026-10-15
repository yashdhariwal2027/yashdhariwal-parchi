/*
 * The invoice PDF (A4), built with @react-pdf/renderer. This module is loaded only when a PDF is needed,
 * so it doesn't slow down the app.
 */

import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DocModel } from "../invoice/doc";

let fontsReady = false;

/** Inter, with the ₹ sign. `base` is where the font files are served from ("/fonts" in the app). */
export function registerFonts(base: string) {
  if (fontsReady) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: `${base}/Inter-400Regular.ttf`, fontWeight: 400 },
      { src: `${base}/Inter-600SemiBold.ttf`, fontWeight: 600 },
      { src: `${base}/Inter-700Bold.ttf`, fontWeight: 700 },
    ],
  });
  // Never break words with hyphens (names, GSTINs, invoice numbers).
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const INK = "#16181d";
const MUTED = "#5b6070";
const LINE = "#e3ded3";
const PAGE_TINT = "#f7f5f0";

const s = StyleSheet.create({
  // No lineHeight here: on the Page it stops the page-number footer from rendering (react-pdf quirk),
  // and inherited through a View it spaces rows far apart. Inter's natural line height reads fine.
  page: { fontFamily: "Inter", fontSize: 9, color: INK, paddingTop: 32, paddingBottom: 40, paddingHorizontal: 34 },
  body: {},
  row: { flexDirection: "row" },
  muted: { color: MUTED },
  small: { fontSize: 8 },
  label: { fontSize: 7.5, fontWeight: 600, color: MUTED, letterSpacing: 0.6, textTransform: "uppercase" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 12 },
  sellerName: { fontSize: 13, fontWeight: 600, marginBottom: 2 },
  title: { fontSize: 14, fontWeight: 700, textTransform: "uppercase", textAlign: "right", letterSpacing: 0.4, marginBottom: 4 },
  meta: { flexDirection: "row", justifyContent: "flex-end", marginTop: 1.5 },
  metaKey: { color: MUTED, width: 80, textAlign: "right", marginRight: 8 },
  metaVal: { minWidth: 92 },
  declaration: { marginTop: 8, backgroundColor: "#efebe3", paddingVertical: 4, paddingHorizontal: 6, fontSize: 8, fontWeight: 600 },
  th: { fontSize: 7, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 5 },
  thead: { flexDirection: "row", backgroundColor: PAGE_TINT, borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: LINE, paddingVertical: 5 },
  cell: { paddingHorizontal: 3 },
  right: { textAlign: "right" },
  mono: { fontFamily: "Inter", letterSpacing: 0.3 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 5, marginTop: 3 },
  watermark: {
    position: "absolute",
    top: 360,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 72,
    fontWeight: 700,
    color: "#b42318",
    opacity: 0.09,
    transform: "rotate(-18deg)",
    letterSpacing: 6,
  },
});

interface Col {
  key: keyof DocModel["rows"][number];
  label: string;
  width: string;
  right?: boolean;
}

function columns(doc: DocModel): Col[] {
  const cols: Col[] = [{ key: "n", label: "#", width: "4%" }];
  const fixed: Col[] = [];
  if (doc.showHsn) fixed.push({ key: "hsn", label: "HSN", width: "9%" });
  fixed.push({ key: "qty", label: "Qty", width: "9%", right: true });
  fixed.push({ key: "price", label: doc.showTax && doc.pricesIncludeGst ? "Price incl. GST" : "Price", width: "14%", right: true });
  if (doc.showDiscount) fixed.push({ key: "discount", label: "Discount", width: "10%", right: true });
  if (doc.showTax) fixed.push({ key: "taxable", label: "Taxable value", width: "13%", right: true });
  if (doc.showTax) fixed.push({ key: "rate", label: "GST", width: "7%", right: true });
  fixed.push({ key: "amount", label: "Amount", width: "13%", right: true });
  const used = 4 + fixed.reduce((t, c) => t + parseFloat(c.width), 0);
  cols.push({ key: "description", label: "Item", width: `${100 - used}%` });
  return [...cols, ...fixed];
}

export function InvoicePdf({ doc, qr }: { doc: DocModel; qr: string | null }) {
  const cols = columns(doc);
  return (
    <Document title={`${doc.title} ${doc.number}`} author={doc.seller.name} creator="Parchi" producer="Parchi">
      <Page size="A4" style={s.page}>
        {(doc.cancelled || doc.isDraft) && (
          <Text style={s.watermark} fixed>
            {doc.cancelled ? "CANCELLED" : "DRAFT"}
          </Text>
        )}

        <View style={s.body}>
        <View style={s.header}>
          <View style={[s.row, { maxWidth: "58%" }]}>
            {doc.seller.logo && <Image src={doc.seller.logo} style={{ width: 46, height: 46, objectFit: "contain", marginRight: 10 }} />}
            <View style={{ flexShrink: 1 }}>
              <Text style={s.sellerName}>{doc.seller.name}</Text>
              {doc.seller.legalName && <Text style={s.muted}>{doc.seller.legalName}</Text>}
              {doc.seller.addressLines.map((l) => (
                <Text key={l} style={s.muted}>
                  {l}
                </Text>
              ))}
              {doc.seller.gstin && <Text style={{ marginTop: 1 }}>GSTIN {doc.seller.gstin}</Text>}
              {doc.seller.contact && <Text style={s.muted}>{doc.seller.contact}</Text>}
            </View>
          </View>
          <View>
            <Text style={s.title}>{doc.title}</Text>
            {doc.copyLabel && <Text style={[s.label, { textAlign: "right", marginBottom: 6 }]}>{doc.copyLabel}</Text>}
            <View style={s.meta}>
              <Text style={s.metaKey}>Invoice no.</Text>
              <Text style={[s.metaVal, { fontWeight: 600 }]}>{doc.number}</Text>
            </View>
            <View style={s.meta}>
              <Text style={s.metaKey}>Date</Text>
              <Text style={s.metaVal}>{doc.date}</Text>
            </View>
            {doc.placeOfSupply && (
              <View style={s.meta}>
                <Text style={s.metaKey}>Place of supply</Text>
                <Text style={s.metaVal}>{doc.placeOfSupply}</Text>
              </View>
            )}
            {doc.reverseCharge && (
              <View style={s.meta}>
                <Text style={s.metaKey}>Reverse charge</Text>
                <Text style={s.metaVal}>{doc.reverseCharge}</Text>
              </View>
            )}
          </View>
        </View>

        {doc.declaration && <Text style={s.declaration}>{doc.declaration}</Text>}

        <View style={{ marginTop: 12 }}>
          <Text style={s.label}>Bill to / Ship to</Text>
          <Text style={{ fontWeight: 600, marginTop: 3 }}>{doc.customer.name}</Text>
          {doc.customer.addressLines.map((l) => (
            <Text key={l}>{l}</Text>
          ))}
          {doc.customer.state && <Text>State: {doc.customer.state}</Text>}
          {doc.customer.gstin && <Text>GSTIN {doc.customer.gstin}</Text>}
          {doc.customer.phone && <Text style={s.muted}>{doc.customer.phone}</Text>}
        </View>

        <View style={{ marginTop: 12 }}>
          <View style={s.thead} fixed>
            {cols.map((c) => (
              <Text key={c.key} style={[s.th, s.cell, { width: c.width }, c.right ? s.right : {}]}>
                {c.label}
              </Text>
            ))}
          </View>
          {doc.rows.map((r, i) => (
            <View key={i} style={s.tr} wrap={false}>
              {cols.map((c) =>
                c.key === "description" ? (
                  <Text key={c.key} style={[s.cell, { width: c.width }]}>
                    {r.description}
                    {r.variant ? <Text style={s.muted}>, {r.variant}</Text> : null}
                  </Text>
                ) : (
                  <Text
                    key={c.key}
                    style={[s.cell, { width: c.width }, c.right ? s.right : {}, c.key === "n" ? s.muted : {}, c.key === "amount" ? { fontWeight: 600 } : {}]}
                  >
                    {r[c.key]}
                  </Text>
                ),
              )}
            </View>
          ))}
        </View>

        <View wrap={false}>
        <View style={[s.row, { justifyContent: "space-between", marginTop: 12 }]}>
          <View style={{ width: "56%" }}>
            {doc.summary.length > 0 && (
              <View style={{ marginBottom: 8 }}>
                <Text style={[s.label, { marginBottom: 3 }]}>Tax summary</Text>
                <View style={s.thead}>
                  <Text style={[s.th, s.cell, { width: "18%" }]}>HSN</Text>
                  <Text style={[s.th, s.cell, s.right, { width: "26%" }]}>Taxable</Text>
                  <Text style={[s.th, s.cell, s.right, { width: "12%" }]}>Rate</Text>
                  {doc.intraState ? (
                    <>
                      <Text style={[s.th, s.cell, s.right, { width: "22%" }]}>CGST</Text>
                      <Text style={[s.th, s.cell, s.right, { width: "22%" }]}>{doc.stateTaxLabel}</Text>
                    </>
                  ) : (
                    <Text style={[s.th, s.cell, s.right, { width: "44%" }]}>IGST</Text>
                  )}
                </View>
                {doc.summary.map((x) => (
                  <View key={`${x.hsn}-${x.rate}`} style={[s.tr, { paddingVertical: 3.5 }]}>
                    <Text style={[s.cell, s.small, { width: "18%" }]}>{x.hsn}</Text>
                    <Text style={[s.cell, s.small, s.right, { width: "26%" }]}>{x.taxable}</Text>
                    <Text style={[s.cell, s.small, s.right, { width: "12%" }]}>{x.rate}</Text>
                    {doc.intraState ? (
                      <>
                        <Text style={[s.cell, s.small, s.right, { width: "22%" }]}>{x.cgst}</Text>
                        <Text style={[s.cell, s.small, s.right, { width: "22%" }]}>{x.sgst}</Text>
                      </>
                    ) : (
                      <Text style={[s.cell, s.small, s.right, { width: "44%" }]}>{x.igst}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
            <Text style={s.small}>
              <Text style={s.muted}>Amount in words: </Text>
              {doc.amountInWords}
            </Text>
            {(doc.payment || doc.paid) && (
              <Text style={[s.small, { marginTop: 2 }]}>
                <Text style={s.muted}>Payment: </Text>
                {[doc.payment, doc.paid ? "Paid" : null].filter(Boolean).join(" · ")}
              </Text>
            )}
            {doc.notes ? (
              <Text style={[s.small, { marginTop: 2 }]}>
                <Text style={s.muted}>Note: </Text>
                {doc.notes}
              </Text>
            ) : null}
          </View>

          <View style={{ width: "36%" }}>
            {doc.totals.map((t) => (
              <View key={t.label} style={s.totalsRow}>
                <Text style={s.muted}>{t.label}</Text>
                <Text>{t.value}</Text>
              </View>
            ))}
            <View style={s.grand}>
              <Text style={{ fontSize: 11, fontWeight: 700 }}>Total</Text>
              <Text style={{ fontSize: 11, fontWeight: 700 }}>{doc.grandTotal}</Text>
            </View>
          </View>
        </View>

        <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-end", marginTop: 18, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 10 }]}>
          <View style={[s.row, { alignItems: "flex-end" }]}>
            {doc.upi && qr && (
              <>
                <Image src={qr} style={{ width: 72, height: 72 }} />
                <View style={{ marginLeft: 8, marginBottom: 4 }}>
                  <Text style={[s.small, s.muted]}>Scan to pay</Text>
                  <Text style={[s.small, { fontWeight: 600 }]}>{doc.upi.amount} by UPI</Text>
                </View>
              </>
            )}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.small}>For {doc.seller.legalName ?? doc.seller.name}</Text>
            {doc.seller.signature ? (
              <Image src={doc.seller.signature} style={{ height: 36, maxWidth: 130, objectFit: "contain", marginVertical: 3 }} />
            ) : (
              <View style={{ height: 30 }} />
            )}
            <Text style={[s.small, s.muted]}>Authorised signatory</Text>
          </View>
        </View>

        {doc.terms ? <Text style={[s.small, s.muted, { marginTop: 10 }]}>{doc.terms}</Text> : null}
        </View>
        {doc.cancelled ? (
          <Text style={[s.small, { marginTop: 6, color: "#b42318", fontWeight: 600 }]}>
            Cancelled{doc.cancelled.reason ? `: ${doc.cancelled.reason}` : ""}
          </Text>
        ) : null}

        </View>

        <View style={{ position: "absolute", bottom: 18, left: 34, right: 34 }} fixed>
          <Text
            style={{ fontSize: 7, color: MUTED, textAlign: "right" }}
            render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${doc.number} · Page ${pageNumber} of ${totalPages}` : " ")}
          />
        </View>
      </Page>
    </Document>
  );
}
