import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Stripe from "stripe";
import { db } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

// Get the Stripe price ID from environment variables
const STRIPE_AD_PRICE_ID = process.env.STRIPE_AD_PRICE_ID;

export async function POST(request: Request) {
  try {
    const session = await getServerSession();

    // Check if user is authenticated
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // Check if price ID is configured
    if (!STRIPE_AD_PRICE_ID) {
      console.error("STRIPE_AD_PRICE_ID environment variable is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { content, autoRenew = true } = await request.json();

    // Validate ad content
    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Ad content is required" },
        { status: 400 },
      );
    }

    if (content.length > 50) {
      return NextResponse.json(
        { error: "Ad content must be 50 characters or less" },
        { status: 400 },
      );
    }

    // Get or create Stripe customer
    let customerId: string;

    // Get user from database
    const userResult = await db.query(
      db.sql`SELECT id FROM users WHERE email = ${session.user.email}`,
    );

    const users = Array.isArray(userResult)
      ? userResult
      : userResult.rows || [];

    if (users.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = users[0].id;

    // Check if user already has a Stripe customer ID
    const customerResult = await db.query(
      db.sql`
        SELECT stripe_customer_id 
        FROM ads 
        WHERE user_id = ${userId} 
        AND stripe_customer_id IS NOT NULL 
        LIMIT 1
      `,
    );

    const customers = Array.isArray(customerResult)
      ? customerResult
      : customerResult.rows || [];

    if (customers.length > 0 && customers[0].stripe_customer_id) {
      customerId = customers[0].stripe_customer_id;
    } else {
      // Create a new customer
      const customer = await stripe.customers.create({
        email: session.user.email!,
        name: session.user.name || undefined,
      });
      customerId = customer.id;
    }

    // Create a subscription using the predefined price ID
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: STRIPE_AD_PRICE_ID,
        },
      ],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
      cancel_at_period_end: !autoRenew, // Set to false for auto-renewal
    });

    // Calculate expiration date (1 month from now)
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    // Store ad in database
    await db.query(
      db.sql`
        INSERT INTO ads (
          user_id, 
          content, 
          active, 
          expires_at, 
          stripe_subscription_id, 
          stripe_customer_id,
          auto_renew,
          payment_confirmed
        )
        VALUES (
          ${userId}, 
          ${content}, 
          true,  
          ${expiresAt.toISOString()}, 
          ${subscription.id}, 
          ${customerId},
          ${autoRenew},
          false
        )
      `,
    );

    // Get the client secret from the subscription
    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    return NextResponse.json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Error creating ad subscription:", error);
    return NextResponse.json(
      { error: "Error creating ad subscription" },
      { status: 500 },
    );
  }
}
