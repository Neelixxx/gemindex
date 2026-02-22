import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { syncUserFromStripeSubscription } from "@/lib/billing-sync";
import { stripeClient, stripeConfigured, stripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";

function checkoutCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | undefined {
  if (!customer) {
    return undefined;
  }
  return typeof customer === "string" ? customer : customer.id;
}

export async function POST(request: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(body, signature, stripeWebhookSecret());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook signature." },
      { status: 400 },
    );
  }

  try {
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      await syncUserFromStripeSubscription(subscription);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const subscription = await stripeClient().subscriptions.retrieve(subscriptionId);
        await syncUserFromStripeSubscription(subscription, {
          userId: session.metadata?.userId,
          customerId: checkoutCustomerId(session.customer),
          email: session.customer_details?.email ?? undefined,
        });
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
