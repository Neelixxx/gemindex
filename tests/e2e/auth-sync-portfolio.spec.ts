import { expect, test } from "@playwright/test";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@gemindex.local`;
}

test("register, verify email, upgrade plan, and update portfolio", async ({ page }) => {
  const email = uniqueEmail("e2e-portfolio");
  const password = "Passw0rd!123";

  const registerRes = await page.request.post("/api/auth/register", {
    data: {
      name: "E2E Portfolio User",
      email,
      password,
    },
  });
  expect(registerRes.status()).toBe(201);
  const registerJson = (await registerRes.json()) as {
    debugVerificationToken?: string;
    requiresEmailVerification?: boolean;
  };
  expect(registerJson.requiresEmailVerification).toBe(true);
  expect(registerJson.debugVerificationToken).toBeTruthy();

  const verifyRes = await page.request.post("/api/auth/verify-email/confirm", {
    data: { token: registerJson.debugVerificationToken },
  });
  expect(verifyRes.status()).toBe(200);

  const blockedCollection = await page.request.post("/api/collection", {
    data: {
      cardId: "card_swsh7-215-umbreon-vmax",
      ownershipType: "RAW",
      quantity: 1,
    },
  });
  expect(blockedCollection.status()).toBe(402);

  const upgradeRes = await page.request.post("/api/billing/subscribe", {
    data: {
      tier: "PRO",
      action: "upgrade",
    },
  });
  expect(upgradeRes.status()).toBe(200);

  const collectionRes = await page.request.post("/api/collection", {
    data: {
      cardId: "card_swsh7-215-umbreon-vmax",
      ownershipType: "RAW",
      quantity: 2,
    },
  });
  expect(collectionRes.status()).toBe(201);

  const wishlistRes = await page.request.post("/api/wishlist", {
    data: {
      cardId: "card_sv2-203-magikarp",
      priority: 2,
      targetPriceUsd: 95,
    },
  });
  expect(wishlistRes.status()).toBe(201);

  const sealedRes = await page.request.post("/api/sealed", {
    data: {
      setId: "set_swsh7",
      productName: "Booster Box",
      productType: "BOOSTER_BOX",
      quantity: 1,
      estimatedValueUsd: 750,
    },
  });
  expect(sealedRes.status()).toBe(201);

  const scanRes = await page.request.post("/api/scanner", {
    data: {
      scannedText: "swsh7 215 Umbreon VMAX",
      destination: "COLLECTION",
      ownershipType: "RAW",
      quantity: 1,
    },
  });
  expect(scanRes.status()).toBe(200);

  const ocrBlockedRes = await page.request.post("/api/scanner/ocr");
  expect(ocrBlockedRes.status()).toBe(400);

  await page.goto("/");
  await expect(page.getByTestId("plan-badge")).toContainText("PRO");
});

test("password reset flow rotates credentials", async ({ page }) => {
  const email = uniqueEmail("e2e-reset");
  const password = "ResetOld!123";
  const newPassword = "ResetNew!123";

  const registerRes = await page.request.post("/api/auth/register", {
    data: {
      name: "E2E Reset User",
      email,
      password,
    },
  });
  expect(registerRes.status()).toBe(201);
  const registerJson = (await registerRes.json()) as { debugVerificationToken?: string };

  const verifyRes = await page.request.post("/api/auth/verify-email/confirm", {
    data: { token: registerJson.debugVerificationToken },
  });
  expect(verifyRes.status()).toBe(200);

  const requestResetRes = await page.request.post("/api/auth/password-reset/request", {
    data: { email },
  });
  expect(requestResetRes.status()).toBe(200);
  const resetJson = (await requestResetRes.json()) as { debugToken?: string };
  expect(resetJson.debugToken).toBeTruthy();

  const confirmResetRes = await page.request.post("/api/auth/password-reset/confirm", {
    data: {
      token: resetJson.debugToken,
      newPassword,
    },
  });
  expect(confirmResetRes.status()).toBe(200);

  await page.request.post("/api/auth/logout", { data: {} });

  const oldLoginRes = await page.request.post("/api/auth/login", {
    data: { email, password },
  });
  expect(oldLoginRes.status()).toBe(401);

  const newLoginRes = await page.request.post("/api/auth/login", {
    data: { email, password: newPassword },
  });
  expect(newLoginRes.status()).toBe(200);
});

test("admin can enqueue sync job", async ({ page }) => {
  const loginRes = await page.request.post("/api/auth/login", {
    data: {
      email: "demo@gemindex.local",
      password: "demo1234",
    },
  });
  expect(loginRes.status()).toBe(200);

  const queueSalesRes = await page.request.post("/api/sync/sales", {
    data: {
      pageLimit: 2,
    },
  });
  expect(queueSalesRes.status()).toBe(202);
  const queued = (await queueSalesRes.json()) as { queued: { id: string } };

  const jobsStatusRes = await page.request.get("/api/jobs/status");
  expect(jobsStatusRes.status()).toBe(200);
  const jobsStatus = (await jobsStatusRes.json()) as { tasks: Array<{ id: string }> };
  expect(jobsStatus.tasks.some((entry) => entry.id === queued.queued.id)).toBe(true);
});
