import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

// Get the Stripe price ID from environment variables
const STRIPE_AD_PRICE_ID = process.env.STRIPE_AD_PRICE_ID;

export async function POST(request: Request) {
  try {
    const session = await getServerSession();

    // Check if user is authenticated
    if (!session?.user?.email) {
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

    const { adId, autoRenew } = await request.json();

    if (!adId) {
      return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });
    }

    // Get user ID from email
    const userResult = await db.query(
      db.sql`SELECT id FROM users WHERE email = ${session.user.email}`,
    );

    const users = userResult.rows || [];
    if (users.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = users[0].id;

    // Get the ad details and verify ownership
    const adResult = await db.query(
      db.sql`
        SELECT * FROM ads 
        WHERE id = ${adId}
        AND user_id = ${userId}
      `,
    );

    const ads = adResult.rows;
    if (ads.length === 0) {
      return NextResponse.json(
        { error: "Ad not found or does not belong to you" },
        { status: 404 },
      );
    }

    const ad = ads[0];

    // Get the price to determine the amount
    const price = await stripe.prices.retrieve(STRIPE_AD_PRICE_ID);
    if (!price.unit_amount) {
      return NextResponse.json(
        { error: "Invalid price configuration" },
        { status: 500 },
      );
    }

    // Create a payment intent first
    const paymentIntent = await stripe.paymentIntents.create({
      amount: price.unit_amount,
      currency: price.currency,
      customer: ad.stripe_customer_id,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        adId: adId,
        userId: userId,
        action: "renew",
        content: ad.content,
        autoRenew:
          autoRenew !== undefined ? String(autoRenew) : String(ad.auto_renew),
      },
    });

    // Update auto_renew setting immediately if specified
    if (autoRenew !== undefined) {
      await db.query(
        db.sql`
          UPDATE ads
          SET auto_renew = ${autoRenew}
          WHERE id = ${adId}
        `,
      );
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      adId: adId,
      amount: price.unit_amount / 100,
      currency: price.currency,
    });
  } catch (error) {
    console.error("Error renewing ad subscription:", error);
    return NextResponse.json(
      { error: "Error renewing ad subscription" },
      { status: 500 },
    );
  }
}
