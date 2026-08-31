"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  type Quote,
  type QuoteBlock,
  type CoverPayload,
  type TextPayload,
  type GalleryPayload,
  type LineItemsPayload,
  type OptionalItemsPayload,
  type OptionalItem,
  type SignaturePayload,
  calcTotals,
} from "../types/quote";

// ─── Formatting ─────────────────────────────────────────────────

const fmt = (n: number, locale = "nl-BE") =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(n);

// ─── Props ──────────────────────────────────────────────────────

interface QuotePublicViewProps {
  quote: Quote;
  /** Called when the client toggles an optional item */
  onToggleOption?: (blockId: string, itemId: string, selected: boolean) => void;
  /** Called when the client signs */
  onSign?: (
    blockId: string,
    data: { signatureDataUrl: string; signerName: string; signerEmail: string }
  ) => void;
}

// ─── Main Component ─────────────────────────────────────────────

export default function QuotePublicView({
  quote,
  onToggleOption,
  onSign,
}: QuotePublicViewProps) {
  // Local state for option toggles so UI is instant
  const [localBlocks, setLocalBlocks] = useState(quote.blocks);

  useEffect(() => {
    setLocalBlocks(quote.blocks);
  }, [quote.blocks]);

  const toggleOption = (blockId: string, itemId: string) => {
    setLocalBlocks((blocks) =>
      blocks.map((b) => {
        if (b.id !== blockId || b.type !== "optional-items") return b;
        const payload = b.payload as OptionalItemsPayload;
        const updated = payload.items.map((i) =>
          i.id === itemId ? { ...i, selected: !i.selected } : i
        );
        const newSelected = updated.find((i) => i.id === itemId)!.selected;
        onToggleOption?.(blockId, itemId, newSelected);
        return { ...b, payload: { ...payload, items: updated } };
      })
    );
  };

  const totals = calcTotals(localBlocks);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl">
        {localBlocks.map((block) => (
          <PublicBlock
            key={block.id}
            block={block}
            onToggleOption={(itemId) => toggleOption(block.id, itemId)}
            onSign={onSign ? (data) => onSign(block.id, data) : undefined}
          />
        ))}

        {/* ── Sticky totals bar ─────────────────────────────── */}
        <div className="sticky bottom-0 border-t border-stone-200 bg-white/95 px-6 py-4 backdrop-blur sm:px-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-0.5 text-sm text-stone-500">
              <div className="flex justify-between gap-8">
                <span>Subtotaal</span>
                <span>{fmt(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between gap-8">
                <span>BTW</span>
                <span>{fmt(totals.vat)}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
                Totaal incl. BTW
              </p>
              <p className="text-2xl font-bold tracking-tight text-stone-900">
                {fmt(totals.total)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Block renderer (public) ────────────────────────────────────

function PublicBlock({
  block,
  onToggleOption,
  onSign,
}: {
  block: QuoteBlock;
  onToggleOption: (itemId: string) => void;
  onSign?: (data: {
    signatureDataUrl: string;
    signerName: string;
    signerEmail: string;
  }) => void;
}) {
  switch (block.type) {
    case "cover":
      return <CoverView payload={block.payload as CoverPayload} />;
    case "text":
      return <TextView payload={block.payload as TextPayload} />;
    case "gallery":
      return <GalleryView payload={block.payload as GalleryPayload} />;
    case "line-items":
      return <LineItemsView payload={block.payload as LineItemsPayload} />;
    case "optional-items":
      return (
        <OptionalItemsView
          payload={block.payload as OptionalItemsPayload}
          onToggle={onToggleOption}
        />
      );
    case "signature":
      return (
        <SignatureView
          payload={block.payload as SignaturePayload}
          onSign={onSign}
        />
      );
    default:
      return null;
  }
}

// ── COVER ───────────────────────────────────────────────────────

function CoverView({ payload }: { payload: CoverPayload }) {
  const hasBanner = !!payload.bannerUrl;

  return (
    <section
      className="relative flex min-h-[340px] flex-col justify-end overflow-hidden sm:min-h-[420px]"
      style={
        hasBanner
          ? {
              backgroundImage: `linear-gradient(to top, rgba(0,0,0,.55) 0%, transparent 60%), url(${payload.bannerUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {!hasBanner && (
        <div className="absolute inset-0 bg-gradient-to-br from-stone-800 to-stone-950" />
      )}

      <div className="relative z-10 flex flex-col gap-4 px-6 pb-10 pt-16 sm:px-10">
        {payload.logoUrl && (
          <img
            src={payload.logoUrl}
            alt="Logo"
            className="mb-2 h-10 w-auto object-contain object-left"
          />
        )}
        <h1 className="max-w-xl text-3xl font-bold leading-tight text-white sm:text-4xl">
          {payload.title || "Offerte"}
        </h1>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/70">
          {payload.clientName && <span>{payload.clientName}</span>}
          {payload.date && (
            <span>
              {new Date(payload.date).toLocaleDateString("nl-BE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// ── TEXT ─────────────────────────────────────────────────────────

function TextView({ payload }: { payload: TextPayload }) {
  return (
    <section className="px-6 py-10 sm:px-10">
      {payload.heading && (
        <h2 className="mb-4 text-xl font-semibold text-stone-800">
          {payload.heading}
        </h2>
      )}
      {payload.html ? (
        <div
          className="prose prose-stone max-w-none leading-relaxed"
          dangerouslySetInnerHTML={{ __html: payload.html }}
        />
      ) : (
        <p className="text-stone-400 italic">Geen tekst toegevoegd.</p>
      )}
    </section>
  );
}

// ── GALLERY ─────────────────────────────────────────────────────

function GalleryView({ payload }: { payload: GalleryPayload }) {
  if (!payload.images.length) return null;

  return (
    <section className="px-6 py-8 sm:px-10">
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${Math.min(payload.columns, payload.images.length)}, 1fr)`,
        }}
      >
        {payload.images.map((img) => (
          <figure key={img.id} className="overflow-hidden rounded-xl">
            <img
              src={img.url}
              alt={img.caption ?? ""}
              className="aspect-[4/3] w-full object-cover"
              loading="lazy"
            />
            {img.caption && (
              <figcaption className="bg-stone-50 px-3 py-2 text-xs text-stone-500">
                {img.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}

// ── LINE ITEMS ──────────────────────────────────────────────────

function LineItemsView({ payload }: { payload: LineItemsPayload }) {
  if (!payload.items.length) return null;

  const subtotal = payload.items.reduce(
    (s, i) => s + i.qty * i.unitPrice,
    0
  );

  return (
    <section className="px-6 py-8 sm:px-10">
      {payload.heading && (
        <h2 className="mb-4 text-lg font-semibold text-stone-800">
          {payload.heading}
        </h2>
      )}

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-stone-200 sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-400">
              <th className="px-4 py-3">Omschrijving</th>
              <th className="w-20 px-4 py-3 text-right">Aantal</th>
              <th className="w-28 px-4 py-3 text-right">Eenheidsprijs</th>
              <th className="w-16 px-4 py-3 text-center">BTW</th>
              <th className="w-28 px-4 py-3 text-right">Subtotaal</th>
            </tr>
          </thead>
          <tbody>
            {payload.items.map((item, i) => (
              <tr
                key={item.id}
                className={
                  i % 2 === 1 ? "bg-stone-50/50" : ""
                }
              >
                <td className="px-4 py-3 text-stone-700">
                  {item.description}
                  {item.ref && (
                    <span className="ml-2 text-xs text-stone-400">
                      {item.ref}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-stone-600">
                  {item.qty}
                </td>
                <td className="px-4 py-3 text-right text-stone-600">
                  {fmt(item.unitPrice)}
                </td>
                <td className="px-4 py-3 text-center text-stone-500">
                  {item.vatRate}%
                </td>
                <td className="px-4 py-3 text-right font-medium text-stone-800">
                  {fmt(item.qty * item.unitPrice)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-stone-200 bg-stone-50">
              <td colSpan={4} className="px-4 py-3 text-right text-sm font-medium text-stone-500">
                Subtotaal
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-stone-800">
                {fmt(subtotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {payload.items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-stone-200 px-4 py-3"
          >
            <p className="font-medium text-stone-800">{item.description}</p>
            {item.ref && (
              <p className="text-xs text-stone-400">{item.ref}</p>
            )}
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-stone-500">
                {item.qty} × {fmt(item.unitPrice)}
              </span>
              <span className="font-semibold text-stone-800">
                {fmt(item.qty * item.unitPrice)}
              </span>
            </div>
          </div>
        ))}
        <div className="flex justify-between rounded-xl bg-stone-50 px-4 py-3 text-sm">
          <span className="font-medium text-stone-500">Subtotaal</span>
          <span className="font-bold text-stone-800">{fmt(subtotal)}</span>
        </div>
      </div>
    </section>
  );
}

// ── OPTIONAL ITEMS ──────────────────────────────────────────────

function OptionalItemsView({
  payload,
  onToggle,
}: {
  payload: OptionalItemsPayload;
  onToggle: (itemId: string) => void;
}) {
  if (!payload.items.length) return null;

  return (
    <section className="px-6 py-8 sm:px-10">
      <h2 className="mb-1 text-lg font-semibold text-stone-800">
        {payload.heading || "Extra opties"}
      </h2>
      <p className="mb-4 text-sm text-stone-400">
        Vink aan om toe te voegen aan uw offerte.
      </p>

      <div className="flex flex-col gap-2">
        {payload.items.map((item) => (
          <label
            key={item.id}
            className={`flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-3 transition ${
              item.selected
                ? "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200"
                : "border-stone-200 bg-white hover:border-stone-300"
            }`}
          >
            <input
              type="checkbox"
              checked={item.selected}
              onChange={() => onToggle(item.id)}
              className="h-5 w-5 shrink-0 rounded border-stone-300 text-emerald-600 accent-emerald-600 focus:ring-emerald-500"
            />
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${
                  item.selected ? "text-emerald-800" : "text-stone-700"
                }`}
              >
                {item.description}
              </p>
              {item.ref && (
                <p className="text-xs text-stone-400">{item.ref}</p>
              )}
            </div>
            <span
              className={`shrink-0 text-sm font-semibold ${
                item.selected ? "text-emerald-700" : "text-stone-600"
              }`}
            >
              + {fmt(item.qty * item.unitPrice)}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

// ── SIGNATURE ───────────────────────────────────────────────────

function SignatureView({
  payload,
  onSign,
}: {
  payload: SignaturePayload;
  onSign?: (data: {
    signatureDataUrl: string;
    signerName: string;
    signerEmail: string;
  }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [name, setName] = useState(payload.signerName ?? "");
  const [email, setEmail] = useState(payload.signerEmail ?? "");
  const [hasSig, setHasSig] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (
    e: React.MouseEvent | React.TouchEvent
  ): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDrawing(true);
    lastPos.current = getPos(e);
    setHasSig(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || !canvasRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d")!;
    const pos = getPos(e);
    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (lastPos.current) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPos.current = pos;
  };

  const endDraw = () => {
    setDrawing(false);
    lastPos.current = null;
  };

  const clearSig = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setHasSig(false);
  };

  const handleAccept = () => {
    if (!canvasRef.current || !name.trim()) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onSign?.({
      signatureDataUrl: dataUrl,
      signerName: name.trim(),
      signerEmail: email.trim(),
    });
  };

  // Already signed
  if (payload.accepted && payload.signatureDataUrl) {
    return (
      <section className="px-6 py-10 sm:px-10">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="mb-3 text-lg font-semibold text-emerald-800">
            ✓ Offerte geaccepteerd
          </p>
          <img
            src={payload.signatureDataUrl}
            alt="Handtekening"
            className="mx-auto mb-2 h-20"
          />
          <p className="text-sm text-emerald-700">
            {payload.signerName}
            {payload.signedAt &&
              ` — ${new Date(payload.signedAt).toLocaleDateString("nl-BE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}`}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="px-6 py-10 sm:px-10">
      <h2 className="mb-1 text-lg font-semibold text-stone-800">
        {payload.label || "Handtekening"}
      </h2>
      <p className="mb-5 text-sm text-stone-400">
        Teken hieronder en klik op &ldquo;Accepteren&rdquo; om de offerte te
        bevestigen.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">
            Naam
          </label>
          <input
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Uw volledige naam"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">
            E-mail
          </label>
          <input
            type="email"
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="uw@email.be"
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white">
          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            className="w-full cursor-crosshair touch-none"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          {!hasSig && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-300">
              Teken hier uw handtekening
            </p>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={clearSig}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-500 hover:bg-stone-50"
          >
            Wissen
          </button>
        </div>
      </div>

      <button
        onClick={handleAccept}
        disabled={!hasSig || !name.trim()}
        className="mt-6 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-10"
      >
        Offerte accepteren
      </button>
    </section>
  );
}
