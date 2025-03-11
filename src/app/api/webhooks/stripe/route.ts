import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

// Get the Stripe price ID from environment variables
const STRIPE_AD_PRICE_ID = process.env.STRIPE_AD_PRICE_ID;
// This is your Stripe webhook secret for testing your endpoint locally
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

  // Handle the event
  try {
    switch (event.type) {
      case "invoice.payment_succeeded":
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          // Activate the ad if payment succeeded
          await db.query(
            db.sql`
              UPDATE ads
              SET active = true
              WHERE stripe_subscription_id = ${invoice.subscription}
            `,
          );

          // Update the expiration date (extend by 1 month)
          await db.query(
            db.sql`
              UPDATE ads
              SET expires_at = (
                CASE 
                  WHEN expires_at < NOW() THEN NOW() + INTERVAL '1 month'
                  ELSE expires_at + INTERVAL '1 month'
                END
              )
              WHERE stripe_subscription_id = ${invoice.subscription}
            `,
          );
        }
        break;

      case "customer.subscription.updated":
        const subscription = event.data.object as Stripe.Subscription;

        // If subscription is active, ensure the ad is active
        if (subscription.status === "active") {
          await db.query(
            db.sql`
              UPDATE ads
              SET active = true
              WHERE stripe_subscription_id = ${subscription.id}
            `,
          );
        } else if (
          ["canceled", "unpaid", "past_due"].includes(subscription.status)
        ) {
          // Deactivate the ad if subscription is canceled or payment failed
          await db.query(
            db.sql`
              UPDATE ads
              SET active = false
              WHERE stripe_subscription_id = ${subscription.id}
            `,
          );
        }

        // Update auto_renew status based on cancel_at_period_end
        if (subscription.cancel_at_period_end !== undefined) {
          await db.query(
            db.sql`
              UPDATE ads
              SET auto_renew = ${!subscription.cancel_at_period_end}
              WHERE stripe_subscription_id = ${subscription.id}
            `,
          );
        }
        break;

      case "customer.subscription.deleted":
        const deletedSubscription = event.data.object as Stripe.Subscription;

        // Deactivate the ad when subscription is deleted
        await db.query(
          db.sql`
            UPDATE ads
            SET active = false, auto_renew = false
            WHERE stripe_subscription_id = ${deletedSubscription.id}
          `,
        );
        break;

      case "customer.subscription.created":
        const newSubscription = event.data.object as Stripe.Subscription;

        // Set auto_renew based on cancel_at_period_end
        await db.query(
          db.sql`
            UPDATE ads
            SET auto_renew = ${!newSubscription.cancel_at_period_end}
            WHERE stripe_subscription_id = ${newSubscription.id}
          `,
        );
        break;

      case "invoice.created":
      case "invoice.finalized":
      case "invoice.updated":
      case "invoice.paid":
        // These invoice events are informational and don't require specific actions
        // We could add logging or monitoring here if needed
        console.log(`Processed invoice event: ${event.type}`);
        break;

      case "charge.succeeded":
        // Payment was successfully charged
        console.log(`Payment charge succeeded for event: ${event.id}`);
        break;

      case "payment_method.attached":
        // A payment method was attached to a customer
        console.log(`Payment method attached for event: ${event.id}`);
        break;

      case "payment_intent.succeeded":
        // Payment intent was successful
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`Payment intent succeeded for event: ${event.id}`);
        console.log("Payment intent metadata:", paymentIntent.metadata);

        // Handle renewal payments
        if (
          paymentIntent.metadata.action === "renew" &&
          paymentIntent.metadata.adId
        ) {
          console.log(
            `Processing renewal payment for ad ${paymentIntent.metadata.adId}`,
          );
          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + 1);

          // Get the current ad details
          const adResult = await db.query(
            db.sql`SELECT stripe_customer_id, auto_renew FROM ads WHERE id = ${paymentIntent.metadata.adId}`,
          );

          if (adResult.rows.length === 0) {
            console.error(`Ad not found: ${paymentIntent.metadata.adId}`);
            break;
          }

          const customerId = adResult.rows[0].stripe_customer_id as string;
          const autoRenew = adResult.rows[0].auto_renew;

          // Create new subscription
          const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: STRIPE_AD_PRICE_ID }],
            metadata: {
              renewedFromAdId: paymentIntent.metadata.adId,
              originalPaymentIntentId: paymentIntent.id,
            },
            payment_behavior: "default_incomplete",
            payment_settings: {
              save_default_payment_method: "on_subscription",
            },
            expand: ["latest_invoice.payment_intent"],
            cancel_at_period_end: !autoRenew,
          });

          // Update the ad
          const updateResult = await db.query(
            db.sql`
              UPDATE ads
              SET 
                active = true,
                expires_at = ${expiresAt.toISOString()},
                stripe_subscription_id = ${subscription.id},
                auto_renew = ${autoRenew}
              WHERE id = ${paymentIntent.metadata.adId}
              RETURNING id, active, expires_at, stripe_subscription_id, auto_renew
            `,
          );

          console.log("Updated ad:", updateResult.rows[0]);
        }
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
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
