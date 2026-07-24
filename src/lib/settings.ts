import { useSyncExternalStore } from "react";

export type PrintFormat = "a4" | "thermal80" | "thermal58";
export type Account = { id: string; name: string; type: "cash" | "bank"; note?: string };

export type SellerPerms = {
  seeCost: boolean;
  editPrice: boolean;
  maxDiscountPercent: number; // 0-100
};

export type Settings = {
  // Store
  storeName: string;
  storePhone: string;
  storeAddress: string;
  storeTaxNo: string;
  invoiceFooter: string;
  // Print
  printFormat: PrintFormat;
  printCopies: number;
  showLogo: boolean;
  customLogoUrl: string | null; // data URL if uploaded
  // Financial
  taxEnabled: boolean;
  taxPercent: number;
  invoicePrefix: string;
  lowStockDefault: number;
  // Accounts
  defaultAccountId: string;
  accounts: Account[];
  // WhatsApp templates
  waInvoiceTemplate: string;
  waReminderTemplate: string;
  // Seller permissions
  sellerPerms: SellerPerms;
};

const KEY = "2a.settings.v1";

const DEFAULTS: Settings = {
  storeName: "نظام 2A",
  storePhone: "",
  storeAddress: "",
  storeTaxNo: "",
  invoiceFooter: "شكراً لتعاملكم معنا",
  printFormat: "a4",
  printCopies: 1,
  showLogo: true,
  customLogoUrl: null,
  taxEnabled: false,
  taxPercent: 0,
  invoicePrefix: "",
  lowStockDefault: 5,
  defaultAccountId: "cash-default",
  accounts: [{ id: "cash-default", name: "الصندوق النقدي", type: "cash" }],
  waInvoiceTemplate: "السلام عليكم {name}،\nفاتورتك رقم {invoice} بمبلغ {total} — المتبقي {due}.\nشكراً لتعاملك مع {store}.",
  waReminderTemplate: "السلام عليكم {name}،\nتذكير: عليك مبلغ متبقٍ قدره {balance}.\nنرجو السداد في أقرب فرصة.\n{store}",
  sellerPerms: {
    seeCost: false,
    editPrice: true,
    maxDiscountPercent: 100,
  },
};

const listeners = new Set<() => void>();
let cache: Settings = load();

function load(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      sellerPerms: { ...DEFAULTS.sellerPerms, ...(parsed.sellerPerms ?? {}) },
    };
  } catch { return DEFAULTS; }
}

export function getSettings(): Settings { return cache; }

export function saveSettings(patch: Partial<Settings>) {
  cache = { ...cache, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* noop */ }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => cache,
    () => DEFAULTS,
  );
}

// Compute tax display info (does not affect stored totals)
export function computeTax(net: number, s: Settings) {
  if (!s.taxEnabled || s.taxPercent <= 0) return { amount: 0, grand: net };
  const amount = Math.max(0, net) * (s.taxPercent / 100);
  return { amount, grand: net + amount };
}

// Format invoice number with prefix
export function formatInvoiceNo(n: number | string, s: Settings) {
  return `${s.invoicePrefix || ""}${n}`;
}

// Render a WhatsApp template with variables
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

// Encode/parse account tag inside sale notes to avoid schema migration
const ACC_RE = /^\[حساب:([^\]]+)\]\s?/;
export function encodeNotes(accountName: string, notes: string): string {
  const clean = (notes || "").replace(ACC_RE, "").trim();
  return `[حساب:${accountName}]${clean ? " " + clean : ""}`;
}
export function parseNotes(notes: string | null | undefined): { account: string | null; text: string } {
  if (!notes) return { account: null, text: "" };
  const m = notes.match(ACC_RE);
  if (!m) return { account: null, text: notes };
  return { account: m[1].trim(), text: notes.replace(ACC_RE, "").trim() };
}
