import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/landing/ui/accordion";

const FAQS = [
  {
    q: "Do my customers need to do anything differently?",
    a: "No. They keep messaging you on WhatsApp or Instagram like they do today. You copy their message and paste it into Parchi.",
  },
  {
    q: "Does it understand Hinglish?",
    a: "Yes. Parchi reads orders the way people really type them: Hinglish, number words like 'do' and 'teen', short forms like '2 pc M', corrections like 'nahi nahi 3 kar do', and messages split across lines. You always check the details before issuing.",
  },
  {
    q: "Are the invoices GST compliant?",
    a: "Parchi follows the GST invoice rules: invoice numbering per financial year, HSN codes, place of supply, CGST and SGST within your state or IGST across states, the 5% or 18% rule for clothing, and the details Rule 46 asks for. It also makes an invoice register and HSN summary for your CA. You stay responsible for your rates and filings, so check with your CA when unsure.",
  },
  {
    q: "Where do the prices come from?",
    a: "You add your products and prices once. Parchi matches the items in each message to your list and fills in the rates, HSN codes and GST. New items can be saved to your list from the invoice.",
  },
  {
    q: "How do plans work?",
    a: "You buy a 30-day pass: Starter (₹249, 100 invoices), Growth (₹349, 250 invoices) or Pro (₹499, 500 invoices). Pay by UPI, card or netbanking. Nothing renews automatically, and you can change plan each time you buy.",
  },
  {
    q: "What happens if I run out of invoices?",
    a: "Buy a new pass and it starts straight away. Your invoices and products are always kept, even between passes.",
  },
  {
    q: "Is my customers' data safe?",
    a: "Each seller's data is private to their account. Customers' phone numbers are removed before a message is sent to the AI. Payments are handled by Razorpay; we never see card or UPI details.",
  },
  {
    q: "Is Parchi connected to WhatsApp?",
    a: "No. Parchi isn't affiliated with WhatsApp or Meta. You copy and paste messages yourself, so we never access your chats.",
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="section">
      <div className="wrap">
        <div className="mx-auto max-w-[720px]">
          <h2 id="faq-title" className="h2">
            Questions
          </h2>
          <Accordion type="single" collapsible className="card mt-8 px-5 md:mt-10 md:px-6">
            {FAQS.map((item, i) => (
              <AccordionItem key={item.q} value={`faq-${i}`}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
