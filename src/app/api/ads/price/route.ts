import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

// Get the Stripe price ID from environment variables
const STRIPE_AD_PRICE_ID = process.env.STRIPE_AD_PRICE_ID;

export async function GET() {
  try {
    // Check if price ID is configured
    if (!STRIPE_AD_PRICE_ID) {
      console.error("STRIPE_AD_PRICE_ID environment variable is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    // Retrieve the price from Stripe
    const price = await stripe.prices.retrieve(STRIPE_AD_PRICE_ID);

    // Format the price for display
    const amount = price.unit_amount
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: price.currency.toUpperCase(),
        }).format(price.unit_amount / 100)
      : "N/A";

    return NextResponse.json({
      priceId: price.id,
      amount,
      interval: price.recurring?.interval || "month",
      currency: price.currency,
    });
  } catch (error) {
    console.error("Error fetching price information:", error);
    return NextResponse.json(
      { error: "Error fetching price information" },
      { status: 500 },
    );
  }
}
