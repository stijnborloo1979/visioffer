// ─── Example: how to use QuoteEditor and QuotePublicView ────────
// Drop these into your Next.js pages, e.g.:
//   app/dashboard/quotes/[id]/edit/page.tsx   → QuoteEditor
//   app/q/[id]/page.tsx                       → QuotePublicView

import QuoteEditor from "./components/QuoteEditor";
import QuotePublicView from "./components/QuotePublicView";
import type { Quote } from "./types/quote";

// ── Sample quote for testing ────────────────────────────────────

export const SAMPLE_QUOTE: Quote = {
  id: "q-demo-001",
  tenantId: "ricoh",
  createdAt: "2026-08-31T10:00:00Z",
  updatedAt: "2026-08-31T10:00:00Z",
  status: "draft",
  currency: "EUR",
  locale: "nl-BE",
  blocks: [
    {
      id: "b1",
      type: "cover",
      payload: {
        title: "Voorstel AV-installatie vergaderzalen",
        clientName: "TechCorp BV",
        date: "2026-08-31",
        bannerUrl: "",
        logoUrl: "",
      },
    },
    {
      id: "b2",
      type: "text",
      payload: {
        heading: "Onze aanpak",
        html: "<p>Op basis van onze analyse stellen wij een volledig geïntegreerde oplossing voor die naadloos aansluit bij uw bestaande infrastructuur. Het systeem is modulair uitbreidbaar en toekomstbestendig.</p>",
      },
    },
    {
      id: "b3",
      type: "line-items",
      payload: {
        heading: "Vergaderzaal A",
        items: [
          {
            id: "li1",
            description: "Samsung QM85R 85\" display",
            ref: "LH85QMREBGCXEN",
            qty: 1,
            unitPrice: 3450,
            vatRate: 21,
          },
          {
            id: "li2",
            description: "Shure MXA920 plafondmicrofoon",
            ref: "MXA920-S",
            qty: 2,
            unitPrice: 1890,
            vatRate: 21,
          },
          {
            id: "li3",
            description: "Installatie en configuratie",
            qty: 1,
            unitPrice: 1200,
            vatRate: 21,
          },
        ],
      },
    },
    {
      id: "b4",
      type: "optional-items",
      payload: {
        heading: "Extra opties",
        items: [
          {
            id: "opt1",
            description: "Draadloos presentatiesysteem (ClickShare CX-50)",
            ref: "R9861522EU",
            qty: 1,
            unitPrice: 1650,
            vatRate: 21,
            selected: false,
          },
          {
            id: "opt2",
            description: "3 jaar onderhoudscontract",
            qty: 1,
            unitPrice: 480,
            vatRate: 21,
            selected: false,
          },
        ],
      },
    },
    {
      id: "b5",
      type: "gallery",
      payload: {
        columns: 3,
        images: [],
      },
    },
    {
      id: "b6",
      type: "signature",
      payload: {
        label: "Handtekening klant",
      },
    },
  ],
};

// ── Admin page ──────────────────────────────────────────────────

export function AdminEditPage() {
  const handleSave = async (quote: Quote) => {
    // POST to your Supabase-backed API route
    console.log("Saving quote:", quote);
    // await fetch('/api/quotes', {
    //   method: 'PUT',
    //   body: JSON.stringify(quote),
    // });
  };

  return <QuoteEditor initial={SAMPLE_QUOTE} onSave={handleSave} />;
}

// ── Public page ─────────────────────────────────────────────────

export function PublicQuotePage() {
  const handleToggle = async (
    blockId: string,
    itemId: string,
    selected: boolean
  ) => {
    // Persist the toggle to Supabase via API
    console.log("Toggle option:", { blockId, itemId, selected });
  };

  const handleSign = async (
    blockId: string,
    data: { signatureDataUrl: string; signerName: string; signerEmail: string }
  ) => {
    // Persist signature + update quote status
    console.log("Signed:", { blockId, ...data });
  };

  return (
    <QuotePublicView
      quote={SAMPLE_QUOTE}
      onToggleOption={handleToggle}
      onSign={handleSign}
    />
  );
}
