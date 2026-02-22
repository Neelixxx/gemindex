"use client";

import { FormEvent, useEffect, useState } from "react";

import type { DashboardData, PublicUser, SetMetrics, SyncState } from "@/lib/types";

type CardApi = {
  cardId: string;
  cardName: string;
  cardNumber: string;
  setCode: string;
  rawPrice: number;
  gemRateBlended: number;
  liquidityScore: number;
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

type OutboxEmail = {
  id: string;
  to: string;
  subject: string;
  template: "VERIFY_EMAIL" | "PASSWORD_RESET";
  body: string;
  createdAt: string;
};

type ApiError = Error & { status?: number };

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
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [sealed, setSealed] = useState<SealedItem[]>([]);
  const [outbox, setOutbox] = useState<OutboxEmail[]>([]);
  const [scanText, setScanText] = useState("");
  const [scanDest, setScanDest] = useState<"COLLECTION" | "WISHLIST">("COLLECTION");
  const [scanImageFile, setScanImageFile] = useState<File | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [syncPageLimit, setSyncPageLimit] = useState(25);
  const [quickCardId, setQuickCardId] = useState("");
  const [quickSetId, setQuickSetId] = useState("");

  function can(feature: keyof SyncStatus["features"]): boolean {
    if (user?.role === "ADMIN" && !sync?.features) {
      return true;
    }
    return Boolean(sync?.features?.[feature]);
  }

  async function refresh(includeOutbox = false) {
    const [d, c, s, y, co, wi, se] = await Promise.all([
      api<DashboardData>("/api/dashboard"),
      api<{ items: CardApi[] }>("/api/cards"),
      api<{ items: SetMetrics[] }>("/api/sets"),
      api<SyncStatus>("/api/sync/status"),
      api<{ items: CollectionItem[] }>("/api/collection"),
      api<{ items: WishlistItem[] }>("/api/wishlist"),
      api<{ items: SealedItem[] }>("/api/sealed"),
    ]);
    setDashboard(d);
    setCards(c.items.slice(0, 60));
    setSets(s.items.slice(0, 30));
    setSync(y);
    setCollection(co.items);
    setWishlist(wi.items);
    setSealed(se.items);
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

      if (out.requiresEmailVerification || !out.user.emailVerified) {
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
      await api("/api/scanner", {
        method: "POST",
        body: JSON.stringify({ scannedText: scanText, destination: scanDest, ownershipType: "RAW", quantity: 1 }),
      });
      setMessage("Scanner import complete.");
      setScanText("");
      await refresh(user?.role === "ADMIN");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scan failed");
    }
  }

  async function runOcrFromImage() {
    if (!can("CARD_SCANNER_OCR")) {
      setMessage("Upgrade to Elite for OCR scanner.");
      return;
    }
    if (!scanImageFile) {
      setMessage("Choose an image before OCR.");
      return;
    }

    try {
      setOcrBusy(true);
      const formData = new FormData();
      formData.append("image", scanImageFile);

      const response = await fetch("/api/scanner/ocr", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as { text?: string; confidence?: number; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `OCR failed (${response.status})`);
      }

      setScanText(payload.text ?? "");
      setMessage(
        `OCR complete (confidence ${(payload.confidence ?? 0).toFixed(1)}). Review text then click Scan.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "OCR failed");
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
        <h1 className="text-3xl font-semibold">Gem Index</h1>
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

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-8">
      <section className="rounded-2xl bg-[linear-gradient(130deg,#0f172a,#0f766e)] p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Gem Index</h1>
            <p className="text-sm text-emerald-100">
              {user.name} ({user.role}) | email {user.emailVerified ? "verified" : "unverified"}
            </p>
            <p className="text-xs text-emerald-200" data-testid="plan-badge">
              Plan {sync?.subscription.tier ?? user.subscriptionTier} | {sync?.subscription.status ?? user.subscriptionStatus}
            </p>
          </div>
          <button className="rounded border border-white/40 px-3 py-1.5 text-sm" onClick={logout}>Logout</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded bg-white/10 p-2 text-sm">Cards: {dashboard?.totalTrackedCards ?? 0}</div>
          <div className="rounded bg-white/10 p-2 text-sm">Sets: {dashboard?.totalSets ?? 0}</div>
          <div className="rounded bg-white/10 p-2 text-sm">Sales: {sync?.totals.sales.toLocaleString() ?? 0}</div>
          <div className="rounded bg-white/10 p-2 text-sm">Last Sync: {sync?.sync.lastSalesSyncAt ? new Date(sync.sync.lastSalesSyncAt).toLocaleDateString() : "never"}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Billing and Entitlements</h2>
        <p className="mt-1 text-sm text-slate-600">
          Current plan {sync?.subscription.tier ?? user.subscriptionTier} ({sync?.subscription.status ?? user.subscriptionStatus})
          {sync?.subscription.currentPeriodEnd ? ` | Renews ${new Date(sync.subscription.currentPeriodEnd).toLocaleDateString()}` : ""}
          {sync?.subscription.trialEndsAt ? ` | Trial ends ${new Date(sync.subscription.trialEndsAt).toLocaleDateString()}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded border border-slate-300 px-3 py-1 text-sm"
            onClick={() => changePlan("FREE")}
            disabled={planBusy}
          >
            Free
          </button>
          <button
            className="rounded border border-cyan-300 bg-cyan-50 px-3 py-1 text-sm"
            onClick={() => changePlan("PRO")}
            disabled={planBusy}
          >
            Pro
          </button>
          <button
            className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1 text-sm"
            onClick={() => changePlan("ELITE")}
            disabled={planBusy}
          >
            Elite
          </button>
          <button
            className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm"
            onClick={openBillingPortal}
          >
            Billing Portal
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Background Sync + Queue</h2>
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
        {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
      </section>

      {user.role === "ADMIN" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Email Outbox (Dev)</h2>
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

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Cards (Top 60)</h2>
          <div className="max-h-96 overflow-auto text-sm">
            {cards.map((card) => (
              <div key={card.cardId} className="grid grid-cols-[2fr_1fr_1fr_1fr] border-b py-1">
                <span>{card.cardName} {card.cardNumber} ({card.setCode.toUpperCase()})</span>
                <span>{usd(card.rawPrice)}</span>
                <span>{card.gemRateBlended.toFixed(2)}%</span>
                <span>{card.liquidityScore.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Set Values (Top 30)</h2>
          <div className="max-h-96 overflow-auto text-sm">
            {sets.map((set) => (
              <div key={set.setId} className="grid grid-cols-[2fr_1fr_1fr] border-b py-1">
                <span>{set.name}</span>
                <span>{usd(set.totalSetValue)}</span>
                <span>{set.roi12m.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Collection</h2>
          <div className="max-h-56 overflow-auto text-sm">
            {collection.map((item) => (
              <div key={item.id} className="border-b py-1">
                {item.card?.name} {item.card?.cardNumber} ({item.card?.setCode.toUpperCase()}) x{item.quantity}
                {item.grader ? ` ${item.grader}${item.grade ? ` ${item.grade}` : ""}` : ""}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Wishlist</h2>
          <div className="max-h-56 overflow-auto text-sm">
            {wishlist.map((item) => (
              <div key={item.id} className="border-b py-1">
                {item.card?.name} {item.card?.cardNumber} ({item.card?.setCode.toUpperCase()}) | P{item.priority} | {usd(item.targetPriceUsd)}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Sealed</h2>
          <div className="max-h-56 overflow-auto text-sm">
            {sealed.map((item) => (
              <div key={item.id} className="border-b py-1">
                {item.productName} ({item.setCode.toUpperCase()}) x{item.quantity} | {usd(item.estimatedValueUsd)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Scanner</h2>
        {!can("CARD_SCANNER_TEXT") ? (
          <p className="mb-2 text-sm text-slate-500">Upgrade to Pro to use card scanner.</p>
        ) : null}
        <form className="flex flex-wrap gap-2" onSubmit={scanCard}>
          <input className="min-w-72 flex-1 rounded border px-3 py-2" value={scanText} onChange={(e) => setScanText(e.target.value)} placeholder="Example: swsh7 215 Umbreon VMAX" required disabled={!can("CARD_SCANNER_TEXT")} />
          <select className="rounded border px-2 py-2" value={scanDest} onChange={(e) => setScanDest(e.target.value as "COLLECTION" | "WISHLIST")} disabled={!can("CARD_SCANNER_TEXT")}>
            <option value="COLLECTION">Collection</option>
            <option value="WISHLIST">Wishlist</option>
          </select>
          <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="submit" disabled={!can("CARD_SCANNER_TEXT")}>Scan</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="rounded border px-2 py-2 text-sm"
            type="file"
            accept="image/*"
            onChange={(event) => setScanImageFile(event.target.files?.[0] ?? null)}
          />
          <button
            className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-60"
            type="button"
            onClick={runOcrFromImage}
            disabled={ocrBusy || !can("CARD_SCANNER_OCR")}
          >
            {!can("CARD_SCANNER_OCR") ? "OCR Requires Elite" : ocrBusy ? "Running OCR..." : "OCR From Image"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Quick Portfolio Actions</h2>
        {!can("PORTFOLIO_TRACKING") ? (
          <p className="mb-2 text-sm text-slate-500">Upgrade to Pro to track collection, wishlist, and sealed positions.</p>
        ) : null}
        <div className="grid gap-2 md:grid-cols-[2fr_2fr_auto_auto_auto]">
          <select className="rounded border px-2 py-2 text-sm" value={quickCardId} onChange={(e) => setQuickCardId(e.target.value)} disabled={!can("PORTFOLIO_TRACKING")}>
            {cards.map((card) => (
              <option key={card.cardId} value={card.cardId}>{card.cardName} {card.cardNumber}</option>
            ))}
          </select>
          <select className="rounded border px-2 py-2 text-sm" value={quickSetId} onChange={(e) => setQuickSetId(e.target.value)} disabled={!can("PORTFOLIO_TRACKING")}>
            {sets.map((set) => (
              <option key={set.setId} value={set.setId}>{set.name}</option>
            ))}
          </select>
          <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60" onClick={quickAddCollection} disabled={!can("PORTFOLIO_TRACKING")} data-testid="quick-add-raw">Add Raw</button>
          <button className="rounded bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-60" onClick={quickAddWishlist} disabled={!can("PORTFOLIO_TRACKING")} data-testid="quick-add-wish">Add Wish</button>
          <button className="rounded bg-cyan-700 px-3 py-2 text-sm text-white disabled:opacity-60" onClick={quickAddSealed} disabled={!can("PORTFOLIO_TRACKING")} data-testid="quick-add-sealed">Add Sealed</button>
        </div>
      </section>
    </main>
  );
}
