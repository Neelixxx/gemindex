import type {
  PublicUser,
  SubscriptionStatus,
  SubscriptionTier,
  UserRecord,
} from "./types";

export type FeatureKey =
  | "PORTFOLIO_TRACKING"
  | "CARD_SCANNER_TEXT"
  | "CARD_SCANNER_OCR"
  | "LIVE_SYNC_QUEUE"
  | "DIRECT_TCGPLAYER_SYNC"
  | "ADVANCED_ANALYTICS";

const tierRank: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO: 1,
  ELITE: 2,
};

const featureTier: Record<FeatureKey, SubscriptionTier> = {
  PORTFOLIO_TRACKING: "PRO",
  CARD_SCANNER_TEXT: "PRO",
  CARD_SCANNER_OCR: "ELITE",
  LIVE_SYNC_QUEUE: "PRO",
  DIRECT_TCGPLAYER_SYNC: "ELITE",
  ADVANCED_ANALYTICS: "PRO",
};

const activeStatuses: SubscriptionStatus[] = ["TRIALING", "ACTIVE"];

export function subscriptionTier(user: Pick<UserRecord, "subscriptionTier" | "role">): SubscriptionTier {
  if (user.role === "ADMIN") {
    return "ELITE";
  }
  return user.subscriptionTier ?? "FREE";
}

export function subscriptionStatus(
  user: Pick<UserRecord, "subscriptionStatus" | "role">,
): SubscriptionStatus {
  if (user.role === "ADMIN") {
    return "ACTIVE";
  }
  return user.subscriptionStatus ?? "ACTIVE";
}

export function hasFeature(user: UserRecord | PublicUser, feature: FeatureKey): boolean {
  if (user.role === "ADMIN") {
    return true;
  }

  const status = subscriptionStatus(user);
  if (!activeStatuses.includes(status)) {
    return false;
  }

  const currentTier = subscriptionTier(user);
  const requiredTier = featureTier[feature];
  return tierRank[currentTier] >= tierRank[requiredTier];
}

export function featureErrorMessage(user: UserRecord | PublicUser, feature: FeatureKey): string {
  const status = subscriptionStatus(user);
  if (!activeStatuses.includes(status)) {
    return "Subscription is inactive. Reactivate billing to continue.";
  }

  const requiredTier = featureTier[feature];
  return `This feature requires ${requiredTier} plan or higher.`;
}

export function featureSnapshot(user: UserRecord | PublicUser): Record<FeatureKey, boolean> {
  return {
    PORTFOLIO_TRACKING: hasFeature(user, "PORTFOLIO_TRACKING"),
    CARD_SCANNER_TEXT: hasFeature(user, "CARD_SCANNER_TEXT"),
    CARD_SCANNER_OCR: hasFeature(user, "CARD_SCANNER_OCR"),
    LIVE_SYNC_QUEUE: hasFeature(user, "LIVE_SYNC_QUEUE"),
    DIRECT_TCGPLAYER_SYNC: hasFeature(user, "DIRECT_TCGPLAYER_SYNC"),
    ADVANCED_ANALYTICS: hasFeature(user, "ADVANCED_ANALYTICS"),
  };
}

export function plusDays(base: Date, days: number): string {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
