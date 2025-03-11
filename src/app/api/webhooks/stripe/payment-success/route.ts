import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

// Get the Stripe price ID from environment variables
const STRIPE_AD_PRICE_ID = process.env.STRIPE_AD_PRICE_ID;
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: Request) {
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature") as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook Error: ${errorMessage}`);
    return NextResponse.json(
      { error: `Webhook Error: ${errorMessage}` },
      { status: 400 },
    );
  }

  try {
    console.log(`Processing webhook event: ${event.type}`);

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log("Payment intent metadata:", paymentIntent.metadata);

      // Check if this is a renewal payment
      if (
        paymentIntent.metadata.action === "renew" &&
        paymentIntent.metadata.adId
      ) {
        console.log(
          `Processing renewal payment for ad ${paymentIntent.metadata.adId}`,
        );
        await handleRenewalPayment(paymentIntent);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Error processing webhook: ${errorMessage}`);
    return NextResponse.json(
      { error: "Error processing webhook" },
      { status: 500 },
    );
  }
}

async function handleRenewalPayment(paymentIntent: Stripe.PaymentIntent) {
  if (!STRIPE_AD_PRICE_ID) {
    throw new Error("STRIPE_AD_PRICE_ID environment variable is not set");
  }

  const { adId, userId, content } = paymentIntent.metadata;
  console.log(`Starting renewal process for ad ${adId}`);

  if (!adId || !userId || !content) {
    throw new Error("Missing required metadata for renewal");
  }

  // Get the original ad to get the customer ID
  const adResult = await db.query(
    db.sql`
      SELECT stripe_customer_id, auto_renew FROM ads 
      WHERE id = ${adId}
      AND user_id = ${userId}
    `,
  );

  const ads = adResult.rows;
  if (ads.length === 0) {
    throw new Error("Original ad not found");
  }

  const customerId = ads[0].stripe_customer_id as string;
  const autoRenew = ads[0].auto_renew;
  console.log(
    `Found ad with customer ID ${customerId} and auto_renew ${autoRenew}`,
  );

  // Create a new subscription using the existing customer ID
  console.log("Creating new Stripe subscription...");
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: STRIPE_AD_PRICE_ID }],
    metadata: {
      renewedFromAdId: adId,
      originalPaymentIntentId: paymentIntent.id,
    },
    cancel_at_period_end: !autoRenew, // Set based on auto_renew preference
  });
  console.log(`Created new subscription: ${subscription.id}`);

  // Calculate new expiration date (1 month from now)
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1);

  // Update the existing ad instead of creating a new one
  console.log("Updating ad in database...");
  const updateResult = await db.query(
    db.sql`
      UPDATE ads
      SET 
        active = true,
        expires_at = ${expiresAt.toISOString()},
        stripe_subscription_id = ${subscription.id},
        auto_renew = ${autoRenew}
      WHERE id = ${adId}
      RETURNING id, active, expires_at, stripe_subscription_id, auto_renew
    `,
  );
  console.log("Update result:", updateResult.rows[0]);

  console.log(
    `Successfully renewed ad ${adId} with new subscription ${subscription.id}`,
  );
}
