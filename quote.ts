// ─── Quote Builder Data Model ───────────────────────────────────
// JSON-based, serializable, Supabase-ready

export type BlockType =
  | "cover"
  | "text"
  | "gallery"
  | "line-items"
  | "optional-items"
  | "signature";

// ─── Individual Block Payloads ──────────────────────────────────

export interface CoverPayload {
  title: string;
  clientName: string;
  date: string; // ISO date
  logoUrl?: string;
  bannerUrl?: string;
}

export interface TextPayload {
  heading?: string;
  html: string; // rich text content
  aiGenerated?: boolean;
}

export interface GalleryImage {
  id: string;
  url: string;
  caption?: string;
}

export interface GalleryPayload {
  columns: 2 | 3 | 4;
  images: GalleryImage[];
}

export interface LineItem {
  id: string;
  description: string;
  ref?: string;
  qty: number;
  unitPrice: number;
  vatRate: 21 | 6;
}

export interface LineItemsPayload {
  heading?: string;
  items: LineItem[];
}

export interface OptionalItem {
  id: string;
  description: string;
  ref?: string;
  unitPrice: number;
  qty: number;
  vatRate: 21 | 6;
  selected: boolean; // toggled by client
}

export interface OptionalItemsPayload {
  heading?: string;
  items: OptionalItem[];
}

export interface SignaturePayload {
  label?: string;
  signedAt?: string; // ISO datetime
  signatureDataUrl?: string; // base64 PNG
  signerName?: string;
  signerEmail?: string;
  accepted?: boolean;
}

// ─── Discriminated Union ────────────────────────────────────────

export type BlockPayloadMap = {
  cover: CoverPayload;
  text: TextPayload;
  gallery: GalleryPayload;
  "line-items": LineItemsPayload;
  "optional-items": OptionalItemsPayload;
  signature: SignaturePayload;
};

export interface QuoteBlock<T extends BlockType = BlockType> {
  id: string;
  type: T;
  payload: BlockPayloadMap[T];
}

// ─── Full Quote Document ────────────────────────────────────────

export interface Quote {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined";
  blocks: QuoteBlock[];
  currency: string; // e.g. "EUR"
  locale: string; // e.g. "nl-BE"
}

// ─── Helpers ────────────────────────────────────────────────────

export function createId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
}

export function defaultBlock<T extends BlockType>(type: T): QuoteBlock<T> {
  const defaults: Record<BlockType, unknown> = {
    cover: {
      title: "",
      clientName: "",
      date: new Date().toISOString().slice(0, 10),
    } satisfies CoverPayload,
    text: { html: "" } satisfies TextPayload,
    gallery: { columns: 3, images: [] } satisfies GalleryPayload,
    "line-items": { items: [] } satisfies LineItemsPayload,
    "optional-items": { items: [] } satisfies OptionalItemsPayload,
    signature: { label: "Handtekening klant" } satisfies SignaturePayload,
  };

  return {
    id: createId(),
    type,
    payload: defaults[type] as BlockPayloadMap[T],
  };
}

// ─── Calculations ───────────────────────────────────────────────

export function lineItemSubtotal(item: LineItem | OptionalItem): number {
  return item.qty * item.unitPrice;
}

export function lineItemVat(item: LineItem | OptionalItem): number {
  return lineItemSubtotal(item) * (item.vatRate / 100);
}

export function calcTotals(blocks: QuoteBlock[]) {
  let subtotal = 0;
  let vat = 0;

  for (const block of blocks) {
    if (block.type === "line-items") {
      const p = block.payload as LineItemsPayload;
      for (const item of p.items) {
        subtotal += lineItemSubtotal(item);
        vat += lineItemVat(item);
      }
    }
    if (block.type === "optional-items") {
      const p = block.payload as OptionalItemsPayload;
      for (const item of p.items) {
        if (item.selected) {
          subtotal += lineItemSubtotal(item);
          vat += lineItemVat(item);
        }
      }
    }
  }

  return { subtotal, vat, total: subtotal + vat };
}
