"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";

import type { DashboardData, DataQualitySnapshot, PublicUser, SetMetrics, SyncState } from "@/lib/types";

type CardApi = {
  cardId: string;
  cardName: string;
  cardNumber: string;
  setCode: string;
  rawPrice: number;
  gemRateBlended: number;
  liquidityScore: number;
};

type CardsResponse = {
  items: CardApi[];
  dataQuality: DataQualitySnapshot;
};

type SetsResponse = {
  items: SetMetrics[];
  dataQuality: DataQualitySnapshot;
};

type SyncStatus = {
  sync: SyncState;
  totals: { sets: number; cards: number; sales: number; populations: number };
  jobs: { configured: number; queued: number; running: number };
  role: "ADMIN" | "USER";
  subscription: {
    tier: "FREE" | "PRO" | "ELITE";
    status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
    currentPeriodEnd?: string;
    trialEndsAt?: string;
  };
  features: {
    PORTFOLIO_TRACKING: boolean;
    CARD_SCANNER_TEXT: boolean;
    CARD_SCANNER_OCR: boolean;
    LIVE_SYNC_QUEUE: boolean;
    DIRECT_TCGPLAYER_SYNC: boolean;
    ADVANCED_ANALYTICS: boolean;
  };
};

type CollectionItem = {
  id: string;
  quantity: number;
  ownershipType: "RAW" | "GRADED";
  grader?: "PSA" | "TAG";
  grade?: number;
  card: { name: string; cardNumber: string; setCode: string } | null;
};

type WishlistItem = {
  id: string;
  priority: number;
  targetPriceUsd?: number;
  card: { name: string; cardNumber: string; setCode: string } | null;
};

type SealedItem = {
  id: string;
  productName: string;
  quantity: number;
  setCode: string;
  estimatedValueUsd?: number;
};

type SealedWishlistItem = {
  id: string;
  productName: string;
  setCode: string;
  priority: number;
  targetPriceUsd?: number;
};

type ImageScanResponse = {
  destination: "COLLECTION" | "WISHLIST" | "PRICE_CHECK";
  itemKind: "RAW_CARD" | "GRADED_SLAB" | "SEALED_PRODUCT" | "UNKNOWN";
  ocr: { text: string; confidence: number };
  barcode?: { value: string; format?: string; detectedCount?: number } | null;
  slab?: { grader?: "PSA" | "TAG"; grade?: number };
  sealed?: { productType?: string; productName?: string } | null;
  match?: {
    confidence: number;
    reason: string;
    card?: { name?: string; cardNumber?: string; setCode?: string } | null;
  } | null;
  setMatch?: { id?: string; name?: string; code?: string; confidence?: number; reason?: string } | null;
  priceCheck?: {
    card?: { raw?: number; psa10?: number; tag10?: number; gemRateBlended?: number } | null;
    set?: { name?: string; totalSetValue?: number } | null;
    sealedEstimateUsd?: number | null;
  } | null;
};

type OutboxEmail = {
  id: string;
  to: string;
  subject: string;
  template: "VERIFY_EMAIL" | "PASSWORD_RESET";
  body: string;
  createdAt: string;
};

type ApiError = Error & { status?: number };
type HomeTab =
  | "CARD_DETAILS"
  | "SET_VALUES"
  | "CARDS_TOP_60"
  | "PERSONAL_COLLECTION"
  | "PERSONAL_COLLECTION_WISHLIST"
  | "SEALED_INVENTORY"
  | "SEALED_WISHLIST"
  | "QUICK_PORTFOLIO_ACTIONS"
  | "SETTINGS";

const HOME_TABS: Array<{ id: HomeTab; label: string }> = [
  { id: "CARD_DETAILS", label: "Card Details" },
  { id: "SET_VALUES", label: "Set Values" },
  { id: "CARDS_TOP_60", label: "Cards (Top 60)" },
  { id: "PERSONAL_COLLECTION", label: "Personal Collection" },
  { id: "PERSONAL_COLLECTION_WISHLIST", label: "Personal Collection Wishlist" },
  { id: "SEALED_INVENTORY", label: "Sealed Inventory" },
  { id: "SEALED_WISHLIST", label: "Sealed Wishlist" },
  { id: "QUICK_PORTFOLIO_ACTIONS", label: "Quick Portfolio Actions" },
  { id: "SETTINGS", label: "Settings" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new Error((json as { error?: string }).error ?? `Request failed (${res.status})`) as ApiError;
    err.status = res.status;
    throw err;
  }
  return json;
}

function usd(v: number | undefined): string {
  return typeof v === "number" ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-";
}

export function GemIndexApp() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("demo@gemindex.local");
  const [authPassword, setAuthPassword] = useState("demo1234");
  const [verifyToken, setVerifyToken] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [cards, setCards] = useState<CardApi[]>([]);
  const [sets, setSets] = useState<SetMetrics[]>([]);
  const [dataQuality, setDataQuality] = useState<DataQualitySnapshot | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [sealed, setSealed] = useState<SealedItem[]>([]);
  const [sealedWishlist, setSealedWishlist] = useState<SealedWishlistItem[]>([]);
  const [outbox, setOutbox] = useState<OutboxEmail[]>([]);
  const [scanText, setScanText] = useState("");
  const [scanDest, setScanDest] = useState<"COLLECTION" | "WISHLIST" | "PRICE_CHECK">("COLLECTION");
  const [scanImageFile, setScanImageFile] = useState<File | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [scanResult, setScanResult] = useState<ImageScanResponse | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [syncPageLimit, setSyncPageLimit] = useState(25);
  const [quickCardId, setQuickCardId] = useState("");
  const [quickSetId, setQuickSetId] = useState("");
  const [activeTab, setActiveTab] = useState<HomeTab>("CARD_DETAILS");
  const [cardSearch, setCardSearch] = useState("");

  function can(feature: keyof SyncStatus["features"]): boolean {
    if (user?.role === "ADMIN" && !sync?.features) {
      return true;
    }
    return Boolean(sync?.features?.[feature]);
  }

  async function refresh(includeOutbox = false) {
    const [d, c, s, y, co, wi, se, sw] = await Promise.all([
      api<DashboardData>("/api/dashboard"),
      api<CardsResponse>("/api/cards"),
      api<SetsResponse>("/api/sets"),
      api<SyncStatus>("/api/sync/status"),
      api<{ items: CollectionItem[] }>("/api/collection"),
      api<{ items: WishlistItem[] }>("/api/wishlist"),
      api<{ items: SealedItem[] }>("/api/sealed"),
      api<{ items: SealedWishlistItem[] }>("/api/sealed-wishlist"),
    ]);
    setDashboard(d);
    setCards(c.items.slice(0, 60));
    setSets(s.items.slice(0, 30));
    setDataQuality(d.dataQuality ?? c.dataQuality ?? s.dataQuality);
    setSync(y);
    setCollection(co.items);
    setWishlist(wi.items);
    setSealed(se.items);
    setSealedWishlist(sw.items);
    if (!quickCardId && c.items.length) {
      setQuickCardId(c.items[0].cardId);
    }
    if (!quickSetId && s.items.length) {
      setQuickSetId(s.items[0].setId);
    }

    if (includeOutbox) {
      try {
        const mail = await api<{ emails: OutboxEmail[] }>("/api/auth/dev/outbox");
        setOutbox(mail.emails);
      } catch {
        setOutbox([]);
      }
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const upgradeError = params.get("upgrade_error");
    if (upgradeError) {
      setMessage(upgradeError);
    }
    const billingState = params.get("billing");
    if (billingState === "success") {
      setMessage("Billing updated successfully.");
    } else if (billingState === "cancel") {
      setMessage("Checkout canceled.");
    } else if (billingState === "portal_return") {
      setMessage("Returned from billing portal.");
    }
  }, []);

  useEffect(() => {
    api<{ user: PublicUser }>("/api/auth/me")
      .then(async (session) => {
        setUser(session.user);
        await refresh(session.user.role === "ADMIN");
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body =
      authMode === "login"
        ? { email: authEmail, password: authPassword }
        : { name: authName, email: authEmail, password: authPassword };
    try {
      const out = await api<{
        user: PublicUser;
        requiresEmailVerification?: boolean;
        debugVerificationToken?: string;
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (authMode === "register" && (out.requiresEmailVerification || !out.user.emailVerified)) {
        setUser(null);
        if (out.debugVerificationToken) {
          setVerifyToken(out.debugVerificationToken);
        }
        setMessage("Account created. Verify your email to sign in.");
        return;
      }

      setUser(out.user);
      setMessage("");
      await refresh(out.user.role === "ADMIN");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    setUser(null);
    setOutbox([]);
  }

  async function changePlan(tier: "FREE" | "PRO" | "ELITE") {
    try {
      setPlanBusy(true);
      const out = await api<{ user?: PublicUser; checkoutUrl?: string; mode?: string }>(
        "/api/billing/subscribe",
        {
        method: "POST",
        body: JSON.stringify({ tier, action: tier === "FREE" ? "downgrade" : "upgrade" }),
      },
      );
      if (out.checkoutUrl) {
        window.location.href = out.checkoutUrl;
        return;
      }
      if (out.user) {
        setUser(out.user);
        await refresh(out.user.role === "ADMIN");
      }
      setMessage(out.mode === "manual" ? `Plan updated to ${tier} (manual mode).` : `Plan updated to ${tier}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update plan.");
    } finally {
      setPlanBusy(false);
    }
  }

  async function openBillingPortal() {
    try {
      const out = await api<{ url: string }>("/api/billing/portal", {
        method: "POST",
        body: "{}",
      });
      window.location.href = out.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open billing portal.");
    }
  }

  async function runSync(mode: "catalog" | "sales") {
    if (!can("LIVE_SYNC_QUEUE")) {
      setMessage("Upgrade to Pro to use background sync.");
      return;
    }
    const endpoint = mode === "catalog" ? "/api/sync/catalog" : "/api/sync/sales";
    try {
      const out = await api<{ queued: { id: string; type: string } }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ pageLimit: syncPageLimit }),
      });
      await refresh(user?.role === "ADMIN");
      setMessage(`${mode} sync queued (${out.queued.id}).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed");
    }
  }

  async function queueDirectTcgplayerSync() {
    if (!can("DIRECT_TCGPLAYER_SYNC")) {
      setMessage("Upgrade to Elite for direct TCGplayer sync.");
      return;
    }
    try {
      const out = await api<{ queued: { id: string } }>("/api/sync/sales", {
        method: "POST",
        body: JSON.stringify({ provider: "TCGPLAYER_DIRECT", cardLimit: 150 }),
      });
      await refresh(user?.role === "ADMIN");
      setMessage(`TCGplayer direct sync queued (${out.queued.id}).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Queue failed");
    }
  }

  async function runWorkerNow() {
    if (!can("LIVE_SYNC_QUEUE")) {
      setMessage("Upgrade to Pro to run worker jobs.");
      return;
    }
    try {
      const out = await api<{ tasksProcessed: number; jobsProcessed: number; skipped: boolean }>(
        "/api/jobs/worker",
        { method: "POST", body: "{}" },
      );
      await refresh(user?.role === "ADMIN");
      setMessage(
        out.skipped
          ? "Worker skipped (already running)."
          : `Worker processed tasks=${out.tasksProcessed}, jobs=${out.jobsProcessed}.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Worker run failed");
    }
  }

  async function requestEmailVerification() {
    try {
      const out = await api<{ ok: boolean; debugToken?: string }>("/api/auth/verify-email/request", {
        method: "POST",
        body: JSON.stringify({ email: authEmail }),
      });
      if (out.debugToken) {
        setVerifyToken(out.debugToken);
      }
      setMessage("If the account exists, a verification message was queued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not request verification");
    }
  }

  async function confirmEmailVerification() {
    try {
      const out = await api<{ user: PublicUser }>("/api/auth/verify-email/confirm", {
        method: "POST",
        body: JSON.stringify({ token: verifyToken }),
      });
      setUser(out.user);
      setVerifyToken("");
      setMessage("Email verified. You are signed in.");
      await refresh(out.user.role === "ADMIN");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed");
    }
  }

  async function requestPasswordReset() {
    try {
      const out = await api<{ ok: boolean; debugToken?: string }>("/api/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email: authEmail }),
      });
      if (out.debugToken) {
        setResetToken(out.debugToken);
      }
      setMessage("If the account exists, a password reset token was queued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not request reset");
    }
  }

  async function confirmPasswordReset() {
    try {
      const out = await api<{ user: PublicUser }>("/api/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      setUser(out.user);
      setResetToken("");
      setNewPassword("");
      setMessage("Password updated. You are signed in.");
      await refresh(out.user.role === "ADMIN");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password reset failed");
    }
  }

  async function scanCard(event: FormEvent) {
    event.preventDefault();
    if (!can("CARD_SCANNER_TEXT")) {
      setMessage("Upgrade to Pro to use scanner.");
      return;
    }
    try {
      const out = await api<ImageScanResponse>("/api/scanner", {
        method: "POST",
        body: JSON.stringify({ scannedText: scanText, destination: scanDest, ownershipType: "RAW", quantity: 1 }),
      });
      setScanResult(out);
      setMessage(scanDest === "PRICE_CHECK" ? "Price check complete." : "Scanner import complete.");
      setScanText("");
      await refresh(user?.role === "ADMIN");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scan failed");
    }
  }

  async function runImageScan() {
    if (!can("CARD_SCANNER_TEXT")) {
      setMessage("Upgrade to Pro to use scanner.");
      return;
    }
    if (!scanImageFile) {
      setMessage("Choose an image before scanning.");
      return;
    }

    try {
      setOcrBusy(true);
      const formData = new FormData();
      formData.append("image", scanImageFile);
      formData.append("destination", scanDest);
      formData.append("quantity", "1");

      const response = await fetch("/api/scanner/image", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as ImageScanResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Image scan failed (${response.status})`);
      }

      setScanResult(payload);
      setScanText(payload.ocr?.text ?? "");
      setMessage(
        payload.destination === "PRICE_CHECK"
          ? `Price check complete (OCR ${(payload.ocr?.confidence ?? 0).toFixed(1)}).`
          : `Image scan complete (OCR ${(payload.ocr?.confidence ?? 0).toFixed(1)}).`,
      );
      await refresh(user?.role === "ADMIN");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image scan failed");
    } finally {
      setOcrBusy(false);
    }
  }

  async function quickAddCollection() {
    if (!can("PORTFOLIO_TRACKING")) {
      setMessage("Upgrade to Pro for portfolio tracking.");
      return;
    }
    await api("/api/collection", {
      method: "POST",
      body: JSON.stringify({ cardId: quickCardId, ownershipType: "RAW", quantity: 1 }),
    });
    await refresh(user?.role === "ADMIN");
  }

  async function quickAddWishlist() {
    if (!can("PORTFOLIO_TRACKING")) {
      setMessage("Upgrade to Pro for portfolio tracking.");
      return;
    }
    await api("/api/wishlist", {
      method: "POST",
      body: JSON.stringify({ cardId: quickCardId, priority: 2 }),
    });
    await refresh(user?.role === "ADMIN");
  }

  async function quickAddSealed() {
    if (!can("PORTFOLIO_TRACKING")) {
      setMessage("Upgrade to Pro for portfolio tracking.");
      return;
    }
    await api("/api/sealed", {
      method: "POST",
      body: JSON.stringify({
        setId: quickSetId,
        productName: "Booster Box",
        productType: "BOOSTER_BOX",
        quantity: 1,
      }),
    });
    await refresh(user?.role === "ADMIN");
  }

  if (loading) return <main className="p-8">Loading Gem Index...</main>;

  if (!user) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="gem-title text-3xl font-semibold">Gem Index</h1>
        <p className="mt-2 text-sm text-slate-600">Live Pokemon TCG analytics + portfolio tracking.</p>
        <form className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4" onSubmit={submitAuth}>
          {authMode === "register" ? (
            <input className="w-full rounded border px-3 py-2" value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Name" required />
          ) : null}
          <input className="w-full rounded border px-3 py-2" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="Email" required />
          <input className="w-full rounded border px-3 py-2" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Password" required />
          <button className="w-full rounded bg-slate-900 px-3 py-2 text-white" type="submit">{authMode === "login" ? "Sign in" : "Create account"}</button>
          <button className="text-sm text-teal-700 underline" type="button" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
            {authMode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
          </button>
          <div className="grid gap-2 border-t border-slate-200 pt-2 text-sm">
            <button className="rounded border border-slate-300 px-3 py-2" type="button" onClick={requestEmailVerification}>
              Resend Email Verification
            </button>
            <input
              className="w-full rounded border px-3 py-2"
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              placeholder="Verification token"
            />
            <button className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2" type="button" onClick={confirmEmailVerification}>
              Confirm Email Token
            </button>
            <button className="rounded border border-slate-300 px-3 py-2" type="button" onClick={requestPasswordReset}>
              Request Password Reset
            </button>
            <input
              className="w-full rounded border px-3 py-2"
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              placeholder="Password reset token"
            />
            <input
              className="w-full rounded border px-3 py-2"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (8+ chars)"
            />
            <button className="rounded border border-cyan-300 bg-cyan-50 px-3 py-2" type="button" onClick={confirmPasswordReset}>
              Confirm Password Reset
            </button>
          </div>
          {message ? <p className="text-sm text-rose-700">{message}</p> : null}
        </form>
      </main>
    );
  }

  const sourceStatus = dataQuality?.status ?? "SEEDED";
  const investmentMetricsReady = dataQuality?.investmentMetricsReady ?? false;
  const sourceBadgeClass =
    sourceStatus === "LIVE_READY"
      ? "bg-emerald-100 text-emerald-800"
      : sourceStatus === "PARTIAL_LIVE"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-200 text-slate-700";
  const query = cardSearch.trim().toLowerCase();
  const matchingCards = query
    ? cards
        .filter((card) =>
          `${card.cardName} ${card.cardNumber} ${card.setCode}`.toLowerCase().includes(query),
        )
        .slice(0, 30)
    : cards.slice(0, 30);
  const selectedCard =
    cards.find((card) => card.cardId === quickCardId) ?? matchingCards[0] ?? cards[0] ?? null;
  const setRows = query
    ? sets
        .filter((set) => `${set.name} ${set.code}`.toLowerCase().includes(query))
        .slice(0, 60)
    : sets.slice(0, 60);
  const cardsTopRows = query
    ? cards
        .filter((card) =>
          `${card.cardName} ${card.cardNumber} ${card.setCode}`.toLowerCase().includes(query),
        )
        .slice(0, 60)
    : cards.slice(0, 60);

  const renderActiveTab = () => {
    if (activeTab === "CARD_DETAILS") {
      return (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">Card Investment Details</h2>
          {selectedCard ? (
            <>
              {!investmentMetricsReady ? (
                <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                  {dataQuality?.blockingReason ??
                    "Investment metrics are still warming up with live data."}
                </p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Card</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedCard.cardName} {selectedCard.cardNumber}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Set</p>
                  <p className="text-sm font-semibold text-slate-900">{selectedCard.setCode.toUpperCase()}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Raw Market Price</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {investmentMetricsReady ? usd(selectedCard.rawPrice) : "Pending"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Gem Rate / Liquidity</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {investmentMetricsReady
                      ? `${selectedCard.gemRateBlended.toFixed(2)}% / ${selectedCard.liquidityScore.toFixed(0)}`
                      : "Pending"}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">No matching card found.</p>
          )}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">Matching Cards</h3>
            <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
              {matchingCards.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">No cards match your search.</p>
              ) : (
                matchingCards.map((card) => (
                  <button
                    key={card.cardId}
                    onClick={() => setQuickCardId(card.cardId)}
                    className={`grid w-full grid-cols-[2fr_1fr_1fr] gap-2 border-b px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      selectedCard?.cardId === card.cardId ? "bg-cyan-50" : ""
                    }`}
                  >
                    <span>
                      {card.cardName} {card.cardNumber}
                    </span>
                    <span>{card.setCode.toUpperCase()}</span>
                    <span>{investmentMetricsReady ? usd(card.rawPrice) : "Pending"}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === "SET_VALUES") {
      return (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Set Values</h2>
          <p className="text-xs text-slate-500">
            {query
              ? `Filtered by "${cardSearch}".`
              : "Review current set values and ROI trends."}
          </p>
          {!investmentMetricsReady ? (
            <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
              {dataQuality?.blockingReason ??
                "Set valuations are hidden until enough live pricing and population coverage is ingested."}
            </p>
          ) : null}
          <div className="max-h-[30rem] overflow-auto rounded-lg border border-slate-200 text-sm">
            {setRows.map((set) => (
              <div key={set.setId} className="grid grid-cols-[2fr_1fr_1fr] border-b px-3 py-2">
                <span>{set.name}</span>
                <span>{investmentMetricsReady ? usd(set.totalSetValue) : "Pending"}</span>
                <span>{investmentMetricsReady ? `${set.roi12m.toFixed(2)}%` : "Pending"}</span>
              </div>
            ))}
            {setRows.length === 0 ? (
              <p className="p-3 text-slate-500">No sets match your current search.</p>
            ) : null}
          </div>
        </div>
      );
    }

    if (activeTab === "CARDS_TOP_60") {
      return (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Cards (Top 60)</h2>
          {!investmentMetricsReady ? (
            <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
              Investment metrics hidden until live coverage is sufficient.
            </p>
          ) : null}
          <div className="max-h-[30rem] overflow-auto rounded-lg border border-slate-200 text-sm">
            {cardsTopRows.map((card) => (
              <div key={card.cardId} className="grid grid-cols-[2fr_1fr_1fr_1fr] border-b px-3 py-2">
                <span>
                  {card.cardName} {card.cardNumber}
                </span>
                <span>{card.setCode.toUpperCase()}</span>
                <span>{investmentMetricsReady ? usd(card.rawPrice) : "Pending"}</span>
                <span>{investmentMetricsReady ? `${card.gemRateBlended.toFixed(2)}%` : "Pending"}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === "PERSONAL_COLLECTION") {
      return (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Personal Collection</h2>
          {!can("PORTFOLIO_TRACKING") ? (
            <p className="text-sm text-slate-500">Upgrade to Pro to track personal collection.</p>
          ) : (
            <div className="max-h-[30rem] overflow-auto rounded-lg border border-slate-200 text-sm">
              {collection.map((item) => (
                <div key={item.id} className="grid grid-cols-[2fr_1fr_1fr] border-b px-3 py-2">
                  <span>
                    {item.card?.name} {item.card?.cardNumber} ({item.card?.setCode.toUpperCase()})
                  </span>
                  <span>{item.ownershipType}</span>
                  <span>x{item.quantity}</span>
                </div>
              ))}
              {collection.length === 0 ? (
                <p className="p-3 text-slate-500">No collection items yet.</p>
              ) : null}
            </div>
          )}
        </div>
      );
    }

    if (activeTab === "PERSONAL_COLLECTION_WISHLIST") {
      return (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Personal Collection Wishlist</h2>
          {!can("PORTFOLIO_TRACKING") ? (
            <p className="text-sm text-slate-500">Upgrade to Pro to track wishlist items.</p>
          ) : (
            <div className="max-h-[30rem] overflow-auto rounded-lg border border-slate-200 text-sm">
              {wishlist.map((item) => (
                <div key={item.id} className="grid grid-cols-[2fr_1fr_1fr] border-b px-3 py-2">
                  <span>
                    {item.card?.name} {item.card?.cardNumber} ({item.card?.setCode.toUpperCase()})
                  </span>
                  <span>P{item.priority}</span>
                  <span>{usd(item.targetPriceUsd)}</span>
                </div>
              ))}
              {wishlist.length === 0 ? (
                <p className="p-3 text-slate-500">No wishlist items yet.</p>
              ) : null}
            </div>
          )}
        </div>
      );
    }

    if (activeTab === "SEALED_INVENTORY") {
      return (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Sealed Inventory</h2>
          {!can("PORTFOLIO_TRACKING") ? (
            <p className="text-sm text-slate-500">Upgrade to Pro to track sealed inventory.</p>
          ) : (
            <div className="max-h-[30rem] overflow-auto rounded-lg border border-slate-200 text-sm">
              {sealed.map((item) => (
                <div key={item.id} className="grid grid-cols-[2fr_1fr_1fr] border-b px-3 py-2">
                  <span>
                    {item.productName} ({item.setCode.toUpperCase()})
                  </span>
                  <span>x{item.quantity}</span>
                  <span>{usd(item.estimatedValueUsd)}</span>
                </div>
              ))}
              {sealed.length === 0 ? (
                <p className="p-3 text-slate-500">No sealed inventory yet.</p>
              ) : null}
            </div>
          )}
        </div>
      );
    }

    if (activeTab === "SEALED_WISHLIST") {
      return (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Sealed Wishlist</h2>
          {!can("PORTFOLIO_TRACKING") ? (
            <p className="text-sm text-slate-500">Upgrade to Pro to track sealed wishlist.</p>
          ) : (
            <div className="max-h-[30rem] overflow-auto rounded-lg border border-slate-200 text-sm">
              {sealedWishlist.map((item) => (
                <div key={item.id} className="grid grid-cols-[2fr_1fr_1fr] border-b px-3 py-2">
                  <span>
                    {item.productName} ({item.setCode.toUpperCase()})
                  </span>
                  <span>P{item.priority}</span>
                  <span>{usd(item.targetPriceUsd)}</span>
                </div>
              ))}
              {sealedWishlist.length === 0 ? (
                <p className="p-3 text-slate-500">No sealed wishlist items yet.</p>
              ) : null}
            </div>
          )}
        </div>
      );
    }

    if (activeTab === "QUICK_PORTFOLIO_ACTIONS") {
      return (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Quick Portfolio Actions</h2>
          {!can("PORTFOLIO_TRACKING") ? (
            <p className="text-sm text-slate-500">
              Upgrade to Pro to track collection, wishlist, and sealed positions.
            </p>
          ) : null}
          <div className="grid gap-2 md:grid-cols-[2fr_2fr_auto_auto_auto]">
            <select
              className="rounded border px-2 py-2 text-sm"
              value={quickCardId}
              onChange={(e) => setQuickCardId(e.target.value)}
              disabled={!can("PORTFOLIO_TRACKING")}
            >
              {cards.map((card) => (
                <option key={card.cardId} value={card.cardId}>
                  {card.cardName} {card.cardNumber}
                </option>
              ))}
            </select>
            <select
              className="rounded border px-2 py-2 text-sm"
              value={quickSetId}
              onChange={(e) => setQuickSetId(e.target.value)}
              disabled={!can("PORTFOLIO_TRACKING")}
            >
              {sets.map((set) => (
                <option key={set.setId} value={set.setId}>
                  {set.name}
                </option>
              ))}
            </select>
            <button
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
              onClick={quickAddCollection}
              disabled={!can("PORTFOLIO_TRACKING")}
              data-testid="quick-add-raw"
            >
              Add Raw
            </button>
            <button
              className="rounded bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-60"
              onClick={quickAddWishlist}
              disabled={!can("PORTFOLIO_TRACKING")}
              data-testid="quick-add-wish"
            >
              Add Wish
            </button>
            <button
              className="rounded bg-cyan-700 px-3 py-2 text-sm text-white disabled:opacity-60"
              onClick={quickAddSealed}
              disabled={!can("PORTFOLIO_TRACKING")}
              data-testid="quick-add-sealed"
            >
              Add Sealed
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Settings</h2>
        <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
          Cards: {dashboard?.totalTrackedCards ?? 0} | Sets: {dashboard?.totalSets ?? 0} | Sales:{" "}
          {sync?.totals.sales.toLocaleString() ?? 0}
        </div>

        <section className="rounded-xl border border-slate-200 p-3">
          <h3 className="font-semibold">Billing and Entitlements</h3>
          <p className="mt-1 text-sm text-slate-600">
            Current plan {sync?.subscription.tier ?? user.subscriptionTier} (
            {sync?.subscription.status ?? user.subscriptionStatus})
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded border border-slate-300 px-3 py-1 text-sm" onClick={() => changePlan("FREE")} disabled={planBusy}>
              Free
            </button>
            <button className="rounded border border-cyan-300 bg-cyan-50 px-3 py-1 text-sm" onClick={() => changePlan("PRO")} disabled={planBusy}>
              Pro
            </button>
            <button className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1 text-sm" onClick={() => changePlan("ELITE")} disabled={planBusy}>
              Elite
            </button>
            <button className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm" onClick={openBillingPortal}>
              Billing Portal
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Background Sync + Queue</h3>
            <input className="w-24 rounded border px-2 py-1 text-sm" type="number" value={syncPageLimit} onChange={(e) => setSyncPageLimit(Number(e.target.value))} />
            {user.role === "ADMIN" && can("LIVE_SYNC_QUEUE") ? (
              <>
                <button className="rounded bg-emerald-700 px-3 py-1 text-sm text-white" onClick={() => runSync("catalog")} data-testid="queue-catalog">Queue Catalog</button>
                <button className="rounded bg-cyan-700 px-3 py-1 text-sm text-white" onClick={() => runSync("sales")} data-testid="queue-sales">Queue Sales</button>
                {can("DIRECT_TCGPLAYER_SYNC") ? <button className="rounded bg-indigo-700 px-3 py-1 text-sm text-white" onClick={queueDirectTcgplayerSync}>Queue TCGplayer Direct</button> : null}
                <button className="rounded bg-slate-900 px-3 py-1 text-sm text-white" onClick={runWorkerNow} data-testid="run-worker-tick">Run Worker Tick</button>
              </>
            ) : <p className="text-xs text-slate-500">Upgrade to Pro to run live sync jobs.</p>}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Jobs: {sync?.jobs.configured ?? 0} configured | {sync?.jobs.queued ?? 0} queued | {sync?.jobs.running ?? 0} running
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 p-3">
          <h3 className="mb-2 font-semibold">Scanner</h3>
          {!can("CARD_SCANNER_TEXT") ? (
            <p className="mb-2 text-sm text-slate-500">Upgrade to Pro to use card scanner.</p>
          ) : null}
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              className="rounded border px-2 py-2"
              value={scanDest}
              onChange={(e) => setScanDest(e.target.value as "COLLECTION" | "WISHLIST" | "PRICE_CHECK")}
              disabled={!can("CARD_SCANNER_TEXT")}
            >
              <option value="COLLECTION">Collection</option>
              <option value="WISHLIST">Wishlist</option>
              <option value="PRICE_CHECK">Price Check</option>
            </select>
            <input
              className="rounded border px-2 py-2 text-sm"
              type="file"
              accept="image/*"
              onChange={(event) => setScanImageFile(event.target.files?.[0] ?? null)}
            />
            <button
              className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-60"
              type="button"
              onClick={runImageScan}
              disabled={ocrBusy || !can("CARD_SCANNER_TEXT")}
            >
              {ocrBusy ? "Scanning..." : "Scan Photo"}
            </button>
          </div>
          <form className="flex flex-wrap gap-2 border-t border-slate-200 pt-3" onSubmit={scanCard}>
            <input
              className="min-w-72 flex-1 rounded border px-3 py-2"
              value={scanText}
              onChange={(e) => setScanText(e.target.value)}
              placeholder="Manual fallback: swsh7 215 Umbreon VMAX"
              required
              disabled={!can("CARD_SCANNER_TEXT")}
            />
            <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="submit" disabled={!can("CARD_SCANNER_TEXT")}>
              Scan Text
            </button>
          </form>
          {scanResult ? (
            <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-medium">
                Result: {scanResult.itemKind.replaceAll("_", " ")} | OCR confidence {(scanResult.ocr?.confidence ?? 0).toFixed(1)}
              </p>
              {scanResult.match?.card ? (
                <p>
                  Card: {scanResult.match.card.name} {scanResult.match.card.cardNumber} ({scanResult.match.card.setCode?.toUpperCase()})
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {user.role === "ADMIN" ? (
          <section className="rounded-xl border border-slate-200 p-3">
            <h3 className="mb-2 font-semibold">Email Outbox (Dev)</h3>
            <div className="max-h-56 overflow-auto text-xs">
              {outbox.length === 0 ? (
                <p className="text-slate-500">No recent messages.</p>
              ) : (
                outbox.map((mail) => (
                  <div key={mail.id} className="border-b py-2">
                    <p>
                      {mail.template} to {mail.to} at {new Date(mail.createdAt).toLocaleString()}
                    </p>
                    <p className="whitespace-pre-wrap text-slate-600">{mail.body}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}
      </div>
    );
  };

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <div className="flex justify-end">
          <button className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700" onClick={logout}>
            Logout
          </button>
        </div>
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="gem-title text-6xl font-bold leading-none tracking-wide sm:text-7xl">Gem Index</h1>
          <Image
            src="/gemindex-icon.png"
            alt="Gem Index app icon"
            width={160}
            height={160}
            priority
            className="h-28 w-28 rounded-2xl border border-slate-200 object-cover shadow-lg sm:h-36 sm:w-36"
          />
          <p className="text-sm text-slate-600">
            {user.name} ({user.role}) | {sync?.subscription.tier ?? user.subscriptionTier} plan
          </p>
          <p className="text-xs text-slate-600" data-testid="plan-badge">
            Status: {sync?.subscription.status ?? user.subscriptionStatus}
          </p>
          <p className="text-xs">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 font-medium ${sourceBadgeClass}`}
              data-testid="data-source-badge"
            >
              Data Source: {dataQuality?.label ?? "Seeded"}
            </span>
          </p>
          <div className="mt-2 w-full max-w-2xl text-left">
            <label htmlFor="card-search" className="mb-1 block text-xs font-medium text-slate-700">
              Search Pokemon Card
            </label>
            <input
              id="card-search"
              value={cardSearch}
              onChange={(event) => {
                setCardSearch(event.target.value);
                setQuickCardId("");
                setActiveTab("CARD_DETAILS");
              }}
              placeholder="Start typing a card name (example: Umbreon VMAX)"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm shadow-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
            />
          </div>
          {message ? <p className="text-sm text-slate-700">{message}</p> : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Tabs</p>
          <nav className="flex flex-col gap-2">
            {HOME_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-3 py-2 text-left text-sm font-medium ${
                  activeTab === tab.id
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">{renderActiveTab()}</div>
      </section>
    </main>
  );
}
