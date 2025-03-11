import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

export async function POST(request: Request) {
  // Check if the request has a valid API key
  const apiKey = request.headers.get("x-api-key");
  const isValidApiKey =
    apiKey === process.env.ADMIN_API_KEY && process.env.ADMIN_API_KEY;

  // If no valid API key, verify user authentication
  if (!isValidApiKey) {
    const session = await getServerSession();

    // Check if user is authenticated
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // For admin-only operations, uncomment this block
    // const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];
    // if (!ADMIN_EMAILS.includes(session.user.email!)) {
    //   console.error(`Unauthorized payment intent creation by ${session.user.email}`);
    //   return NextResponse.json(
    //     { error: "Unauthorized" },
    //     { status: 403 }
    //   );
    // }
  }

  try {
    const { amount } = await request.json();

    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    return NextResponse.json(
      { error: "Error creating payment intent" },
      { status: 500 },
    );
  }
}
