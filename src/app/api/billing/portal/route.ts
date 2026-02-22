import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { attachStripeCustomerToUser } from "@/lib/billing-sync";
import { billingBaseUrl, stripeClient, stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe billing is not configured in this environment." },
      { status: 503 },
    );
  }

  try {
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeClient().customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await attachStripeCustomerToUser(user.id, customer.id);
    }

    const session = await stripeClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${billingBaseUrl()}/?billing=portal_return`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create portal session." },
      { status: 500 },
    );
  }
}
