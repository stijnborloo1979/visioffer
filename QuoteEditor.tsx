"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  type Quote,
  type QuoteBlock,
  type BlockType,
  type CoverPayload,
  type TextPayload,
  type GalleryPayload,
  type GalleryImage,
  type LineItemsPayload,
  type LineItem,
  type OptionalItemsPayload,
  type OptionalItem,
  type SignaturePayload,
  defaultBlock,
  createId,
  calcTotals,
} from "../types/quote";

// ─── Block palette ──────────────────────────────────────────────

const BLOCK_CATALOG: { type: BlockType; label: string; icon: string }[] = [
  { type: "cover", label: "Cover", icon: "🎨" },
  { type: "text", label: "Tekst / AI", icon: "📝" },
  { type: "gallery", label: "Galerij", icon: "🖼️" },
  { type: "line-items", label: "Artikelen", icon: "📋" },
  { type: "optional-items", label: "Opties", icon: "☑️" },
  { type: "signature", label: "Handtekening", icon: "✍️" },
];

// ─── Formatting helper ──────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
  }).format(n);

// ─── Main Component ─────────────────────────────────────────────

interface QuoteEditorProps {
  initial?: Quote;
  onSave?: (quote: Quote) => void;
}

export default function QuoteEditor({ initial, onSave }: QuoteEditorProps) {
  const [quote, setQuote] = useState<Quote>(
    initial ?? {
      id: createId(),
      tenantId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "draft",
      blocks: [defaultBlock("cover")],
      currency: "EUR",
      locale: "nl-BE",
    }
  );

  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // ── Block CRUD ──────────────────────────────────────────────

  const updateBlocks = useCallback(
    (fn: (blocks: QuoteBlock[]) => QuoteBlock[]) => {
      setQuote((q) => ({
        ...q,
        updatedAt: new Date().toISOString(),
        blocks: fn([...q.blocks]),
      }));
    },
    []
  );

  const addBlock = (type: BlockType) => {
    updateBlocks((b) => [...b, defaultBlock(type)]);
  };

  const removeBlock = (id: string) => {
    updateBlocks((b) => b.filter((bl) => bl.id !== id));
  };

  const moveBlock = (from: number, to: number) => {
    updateBlocks((b) => {
      const item = b.splice(from, 1)[0];
      b.splice(to, 0, item);
      return b;
    });
  };

  const patchPayload = <T extends BlockType>(
    id: string,
    patch: Partial<Quote["blocks"][number]["payload"]>
  ) => {
    updateBlocks((b) =>
      b.map((bl) =>
        bl.id === id
          ? { ...bl, payload: { ...bl.payload, ...patch } }
          : bl
      )
    );
  };

  // ── Drag & Drop ─────────────────────────────────────────────

  const handleDragStart = (idx: number) => {
    dragIdx.current = idx;
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (idx: number) => {
    if (dragIdx.current !== null && dragIdx.current !== idx) {
      moveBlock(dragIdx.current, idx);
    }
    dragIdx.current = null;
    setDragOverIdx(null);
  };

  // ── Totals ──────────────────────────────────────────────────

  const totals = calcTotals(quote.blocks);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-stone-800">
            Offerte bewerken
          </h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            {quote.status}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-stone-600">
            Totaal {fmt(totals.total)}
          </span>
          <button
            onClick={() => onSave?.(quote)}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
          >
            Opslaan
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-5 p-5">
        {/* ── Sidebar: block palette ─────────────────────────── */}
        <aside className="sticky top-20 flex h-fit w-48 shrink-0 flex-col gap-1.5 rounded-xl border border-stone-200 bg-white p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Blok toevoegen
          </p>
          {BLOCK_CATALOG.map((b) => (
            <button
              key={b.type}
              onClick={() => addBlock(b.type)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100"
            >
              <span className="text-base">{b.icon}</span>
              {b.label}
            </button>
          ))}
        </aside>

        {/* ── Block list ─────────────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col gap-3">
          {quote.blocks.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-stone-200 py-20 text-center text-sm text-stone-400">
              Klik links op een bloktype om te beginnen.
            </div>
          )}

          {quote.blocks.map((block, idx) => (
            <div
              key={block.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => setDragOverIdx(null)}
              className={`group relative rounded-xl border bg-white shadow-sm transition ${
                dragOverIdx === idx
                  ? "border-blue-400 ring-2 ring-blue-100"
                  : "border-stone-200"
              }`}
            >
              {/* Block header bar */}
              <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-2">
                <span className="cursor-grab text-stone-300 hover:text-stone-500">
                  ⠿
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                  {BLOCK_CATALOG.find((c) => c.type === block.type)?.icon}{" "}
                  {BLOCK_CATALOG.find((c) => c.type === block.type)?.label}
                </span>
                <span className="flex-1" />
                <button
                  onClick={() => idx > 0 && moveBlock(idx, idx - 1)}
                  className="rounded p-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                  title="Omhoog"
                >
                  ▲
                </button>
                <button
                  onClick={() =>
                    idx < quote.blocks.length - 1 && moveBlock(idx, idx + 1)
                  }
                  className="rounded p-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                  title="Omlaag"
                >
                  ▼
                </button>
                <button
                  onClick={() => removeBlock(block.id)}
                  className="rounded p-1 text-xs text-red-300 hover:bg-red-50 hover:text-red-500"
                  title="Verwijderen"
                >
                  ✕
                </button>
              </div>

              {/* Block body */}
              <div className="p-4">
                <BlockEditor
                  block={block}
                  onPatch={(patch) => patchPayload(block.id, patch)}
                  onUpdateBlocks={updateBlocks}
                />
              </div>
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}

// ─── Block-specific editors ─────────────────────────────────────

interface BlockEditorProps {
  block: QuoteBlock;
  onPatch: (patch: Record<string, unknown>) => void;
  onUpdateBlocks: (fn: (b: QuoteBlock[]) => QuoteBlock[]) => void;
}

function BlockEditor({ block, onPatch, onUpdateBlocks }: BlockEditorProps) {
  switch (block.type) {
    case "cover":
      return <CoverEditor payload={block.payload as CoverPayload} onPatch={onPatch} />;
    case "text":
      return <TextEditor payload={block.payload as TextPayload} onPatch={onPatch} />;
    case "gallery":
      return <GalleryEditor payload={block.payload as GalleryPayload} onPatch={onPatch} />;
    case "line-items":
      return <LineItemsEditor payload={block.payload as LineItemsPayload} onPatch={onPatch} />;
    case "optional-items":
      return <OptionalItemsEditor payload={block.payload as OptionalItemsPayload} onPatch={onPatch} />;
    case "signature":
      return <SignatureEditor payload={block.payload as SignaturePayload} onPatch={onPatch} />;
    default:
      return <p className="text-sm text-stone-400">Onbekend bloktype</p>;
  }
}

// ── Field helper ────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-300 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-300";

// ── COVER ───────────────────────────────────────────────────────

function CoverEditor({
  payload,
  onPatch,
}: {
  payload: CoverPayload;
  onPatch: (p: Partial<CoverPayload>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Offerte-titel">
        <input
          className={inputCls}
          value={payload.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder="Voorstel audiovisuele installatie"
        />
      </Field>
      <Field label="Klantnaam">
        <input
          className={inputCls}
          value={payload.clientName}
          onChange={(e) => onPatch({ clientName: e.target.value })}
          placeholder="Acme BV"
        />
      </Field>
      <Field label="Datum">
        <input
          type="date"
          className={inputCls}
          value={payload.date}
          onChange={(e) => onPatch({ date: e.target.value })}
        />
      </Field>
      <Field label="Logo URL">
        <input
          className={inputCls}
          value={payload.logoUrl ?? ""}
          onChange={(e) => onPatch({ logoUrl: e.target.value })}
          placeholder="https://…"
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Banner URL (achtergrond)">
          <input
            className={inputCls}
            value={payload.bannerUrl ?? ""}
            onChange={(e) => onPatch({ bannerUrl: e.target.value })}
            placeholder="https://…"
          />
        </Field>
      </div>
    </div>
  );
}

// ── TEXT / AI ────────────────────────────────────────────────────

function TextEditor({
  payload,
  onPatch,
}: {
  payload: TextPayload;
  onPatch: (p: Partial<TextPayload>) => void;
}) {
  const [aiLoading, setAiLoading] = useState(false);

  const generateAI = async () => {
    setAiLoading(true);
    try {
      // Placeholder — wire up to your Cloudflare Worker / Anthropic proxy
      const res = await fetch("/api/ai/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heading: payload.heading,
          context: "offerte",
        }),
      });
      const data = await res.json();
      onPatch({ html: data.text, aiGenerated: true });
    } catch {
      // silent fail — user can type manually
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label="Koptekst (optioneel)">
        <input
          className={inputCls}
          value={payload.heading ?? ""}
          onChange={(e) => onPatch({ heading: e.target.value })}
          placeholder="Onze aanpak"
        />
      </Field>
      <Field label="Inhoud">
        <textarea
          className={`${inputCls} min-h-[120px] resize-y`}
          value={payload.html}
          onChange={(e) => onPatch({ html: e.target.value })}
          placeholder="Beschrijf het project, de aanpak of oplossing…"
          rows={5}
        />
      </Field>
      <button
        onClick={generateAI}
        disabled={aiLoading}
        className="flex items-center gap-1.5 self-start rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
      >
        {aiLoading ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600" />
        ) : (
          "✦"
        )}{" "}
        AI-tekst genereren
      </button>
    </div>
  );
}

// ── GALLERY ─────────────────────────────────────────────────────

function GalleryEditor({
  payload,
  onPatch,
}: {
  payload: GalleryPayload;
  onPatch: (p: Partial<GalleryPayload>) => void;
}) {
  const addImage = () => {
    const url = prompt("Plak de afbeeldings-URL:");
    if (!url) return;
    onPatch({
      images: [...payload.images, { id: createId(), url, caption: "" }],
    });
  };

  const removeImage = (id: string) =>
    onPatch({ images: payload.images.filter((i) => i.id !== id) });

  const updateCaption = (id: string, caption: string) =>
    onPatch({
      images: payload.images.map((i) =>
        i.id === id ? { ...i, caption } : i
      ),
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Field label="Kolommen">
          <select
            className={inputCls}
            value={payload.columns}
            onChange={(e) =>
              onPatch({ columns: Number(e.target.value) as 2 | 3 | 4 })
            }
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </Field>
        <button
          onClick={addImage}
          className="mt-5 rounded-lg bg-stone-100 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-200"
        >
          + Foto toevoegen
        </button>
      </div>

      {payload.images.length > 0 && (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${payload.columns}, 1fr)`,
          }}
        >
          {payload.images.map((img) => (
            <div
              key={img.id}
              className="group relative overflow-hidden rounded-lg border border-stone-200"
            >
              <img
                src={img.url}
                alt={img.caption}
                className="aspect-[4/3] w-full object-cover"
              />
              <button
                onClick={() => removeImage(img.id)}
                className="absolute right-1 top-1 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white opacity-0 transition group-hover:opacity-100"
              >
                ✕
              </button>
              <input
                className="w-full border-t border-stone-100 px-2 py-1 text-xs text-stone-600 focus:outline-none"
                value={img.caption ?? ""}
                onChange={(e) => updateCaption(img.id, e.target.value)}
                placeholder="Bijschrift…"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── LINE ITEMS ──────────────────────────────────────────────────

function LineItemsEditor({
  payload,
  onPatch,
}: {
  payload: LineItemsPayload;
  onPatch: (p: Partial<LineItemsPayload>) => void;
}) {
  const addItem = () => {
    onPatch({
      items: [
        ...payload.items,
        {
          id: createId(),
          description: "",
          qty: 1,
          unitPrice: 0,
          vatRate: 21,
        },
      ],
    });
  };

  const removeItem = (id: string) =>
    onPatch({ items: payload.items.filter((i) => i.id !== id) });

  const patchItem = (id: string, patch: Partial<LineItem>) =>
    onPatch({
      items: payload.items.map((i) =>
        i.id === id ? { ...i, ...patch } : i
      ),
    });

  const subtotal = payload.items.reduce(
    (sum, i) => sum + i.qty * i.unitPrice,
    0
  );

  return (
    <div className="flex flex-col gap-3">
      <Field label="Sectietitel (optioneel)">
        <input
          className={inputCls}
          value={payload.heading ?? ""}
          onChange={(e) => onPatch({ heading: e.target.value })}
          placeholder="Vergaderzaal A"
        />
      </Field>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs font-medium text-stone-500">
              <th className="px-3 py-2">Omschrijving</th>
              <th className="w-16 px-3 py-2 text-right">Aantal</th>
              <th className="w-24 px-3 py-2 text-right">Eenheid</th>
              <th className="w-20 px-3 py-2 text-center">BTW</th>
              <th className="w-24 px-3 py-2 text-right">Subtotaal</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {payload.items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-stone-50 last:border-0"
              >
                <td className="px-2 py-1.5">
                  <input
                    className="w-full rounded border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-stone-300"
                    value={item.description}
                    onChange={(e) =>
                      patchItem(item.id, { description: e.target.value })
                    }
                    placeholder="Artikelnaam"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border-0 bg-transparent px-1 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-stone-300"
                    value={item.qty}
                    onChange={(e) =>
                      patchItem(item.id, {
                        qty: Number(e.target.value) || 0,
                      })
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="w-full rounded border-0 bg-transparent px-1 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-stone-300"
                    value={item.unitPrice}
                    onChange={(e) =>
                      patchItem(item.id, {
                        unitPrice: Number(e.target.value) || 0,
                      })
                    }
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <select
                    className="rounded border-0 bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-stone-300"
                    value={item.vatRate}
                    onChange={(e) =>
                      patchItem(item.id, {
                        vatRate: Number(e.target.value) as 21 | 6,
                      })
                    }
                  >
                    <option value={21}>21%</option>
                    <option value={6}>6%</option>
                  </select>
                </td>
                <td className="px-3 py-1.5 text-right text-sm font-medium text-stone-700">
                  {fmt(item.qty * item.unitPrice)}
                </td>
                <td className="px-1">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="rounded p-1 text-xs text-red-300 hover:text-red-500"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={addItem}
          className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200"
        >
          + Artikel toevoegen
        </button>
        <span className="text-sm font-semibold text-stone-700">
          Subtotaal: {fmt(subtotal)}
        </span>
      </div>
    </div>
  );
}

// ── OPTIONAL ITEMS ──────────────────────────────────────────────

function OptionalItemsEditor({
  payload,
  onPatch,
}: {
  payload: OptionalItemsPayload;
  onPatch: (p: Partial<OptionalItemsPayload>) => void;
}) {
  const addItem = () => {
    onPatch({
      items: [
        ...payload.items,
        {
          id: createId(),
          description: "",
          qty: 1,
          unitPrice: 0,
          vatRate: 21,
          selected: false,
        },
      ],
    });
  };

  const removeItem = (id: string) =>
    onPatch({ items: payload.items.filter((i) => i.id !== id) });

  const patchItem = (id: string, patch: Partial<OptionalItem>) =>
    onPatch({
      items: payload.items.map((i) =>
        i.id === id ? { ...i, ...patch } : i
      ),
    });

  return (
    <div className="flex flex-col gap-3">
      <Field label="Sectietitel (optioneel)">
        <input
          className={inputCls}
          value={payload.heading ?? ""}
          onChange={(e) => onPatch({ heading: e.target.value })}
          placeholder="Extra opties"
        />
      </Field>

      <div className="overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs font-medium text-stone-500">
              <th className="w-8 px-3 py-2">✓</th>
              <th className="px-3 py-2">Omschrijving</th>
              <th className="w-16 px-3 py-2 text-right">Aantal</th>
              <th className="w-24 px-3 py-2 text-right">Prijs</th>
              <th className="w-20 px-3 py-2 text-center">BTW</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {payload.items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-stone-50 last:border-0"
              >
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(e) =>
                      patchItem(item.id, { selected: e.target.checked })
                    }
                    className="accent-emerald-600"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    className="w-full rounded border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-stone-300"
                    value={item.description}
                    onChange={(e) =>
                      patchItem(item.id, { description: e.target.value })
                    }
                    placeholder="Optioneel artikel"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border-0 bg-transparent px-1 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-stone-300"
                    value={item.qty}
                    onChange={(e) =>
                      patchItem(item.id, {
                        qty: Number(e.target.value) || 0,
                      })
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="w-full rounded border-0 bg-transparent px-1 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-stone-300"
                    value={item.unitPrice}
                    onChange={(e) =>
                      patchItem(item.id, {
                        unitPrice: Number(e.target.value) || 0,
                      })
                    }
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <select
                    className="rounded border-0 bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-stone-300"
                    value={item.vatRate}
                    onChange={(e) =>
                      patchItem(item.id, {
                        vatRate: Number(e.target.value) as 21 | 6,
                      })
                    }
                  >
                    <option value={21}>21%</option>
                    <option value={6}>6%</option>
                  </select>
                </td>
                <td className="px-1">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="rounded p-1 text-xs text-red-300 hover:text-red-500"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={addItem}
        className="self-start rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200"
      >
        + Optie toevoegen
      </button>
    </div>
  );
}

// ── SIGNATURE ───────────────────────────────────────────────────

function SignatureEditor({
  payload,
  onPatch,
}: {
  payload: SignaturePayload;
  onPatch: (p: Partial<SignaturePayload>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Label">
        <input
          className={inputCls}
          value={payload.label ?? ""}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="Handtekening klant"
        />
      </Field>
      <p className="text-xs text-stone-400">
        De klant tekent en accepteert via de publieke offertepagina.
        {payload.signedAt && (
          <span className="ml-2 font-medium text-emerald-600">
            ✓ Getekend op{" "}
            {new Date(payload.signedAt).toLocaleDateString("nl-BE")}
          </span>
        )}
      </p>
    </div>
  );
}
