import { useSyncExternalStore } from "react";

export type PrintFormat = "a4" | "thermal80" | "thermal58";
export type Account = { id: string; name: string; type: "cash" | "bank"; note?: string };

export type Settings = {
  storeName: string;
  storePhone: string;
  storeAddress: string;
  invoiceFooter: string;
  printFormat: PrintFormat;
  printCopies: number;
  showLogo: boolean;
  defaultAccountId: string;
  accounts: Account[];
};

const KEY = "2a.settings.v1";

const DEFAULTS: Settings = {
  storeName: "نظام 2A",
  storePhone: "",
  storeAddress: "",
  invoiceFooter: "شكراً لتعاملكم معنا",
  printFormat: "a4",
  printCopies: 1,
  showLogo: true,
  defaultAccountId: "cash-default",
  accounts: [
    { id: "cash-default", name: "الصندوق النقدي", type: "cash" },
  ],
};

const listeners = new Set<() => void>();
let cache: Settings = load();

function load(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
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
