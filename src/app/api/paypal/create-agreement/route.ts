import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    // Get access token
    const baseUrl =
      process.env.NODE_ENV === "development"
        ? "https://api-m.sandbox.paypal.com"
        : "https://api-m.paypal.com";

    const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });

    const { access_token } = await authResponse.json();

    // Create billing plan
    const planResponse = await fetch(`${baseUrl}/v1/payments/billing-plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        name: "The Counter Weekly Payout Plan",
        description: "Plan for receiving weekly payouts from The Counter",
        type: "INFINITE",
        payment_definitions: [
          {
            name: "Weekly Payout",
            type: "REGULAR",
            frequency: "WEEK",
            frequency_interval: "1",
            amount: {
              value: "0.01",
              currency: "USD",
            },
            cycles: "0",
          },
        ],
        merchant_preferences: {
          setup_fee: {
            value: "0",
            currency: "USD",
          },
          return_url: `${process.env.NEXT_PUBLIC_URL}/api/paypal/success`,
          cancel_url: `${process.env.NEXT_PUBLIC_URL}/api/paypal/cancel`,
          auto_bill_amount: "YES",
          initial_fail_amount_action: "CONTINUE",
          max_fail_attempts: "0",
        },
      }),
    });

    const plan = await planResponse.json();
    console.log("Plan response:", plan);

    if (!plan.id) {
      console.error("Invalid plan response:", plan);
      return new NextResponse("Failed to create billing plan", { status: 500 });
    }

    // Activate the plan
    await fetch(`${baseUrl}/v1/payments/billing-plans/${plan.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify([
        {
          op: "replace",
          path: "/",
          value: {
            state: "ACTIVE",
          },
        },
      ]),
    });

    // Create billing agreement
    const agreementResponse = await fetch(
      `${baseUrl}/v1/payments/billing-agreements`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({
          name: "The Counter Weekly Payout Agreement",
          description:
            "Agreement for receiving weekly payouts from The Counter",
          start_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          payer: {
            payment_method: "paypal",
          },
          plan: {
            id: plan.id,
          },
        }),
      },
    );

    const agreement = await agreementResponse.json();
    console.log("Agreement response:", agreement);

    if (!agreementResponse.ok) {
      console.error("Agreement error:", agreement);
      return new NextResponse(
        agreement.message || "Failed to create agreement",
        { status: agreementResponse.status },
      );
    }

    if (!agreement.links) {
      console.error("Invalid agreement response:", agreement);
      return new NextResponse("Invalid agreement response", { status: 500 });
    }

    // Define a type for PayPal link objects
    interface PayPalLink {
      href: string;
      rel: string;
      method: string;
    }

    const approvalUrl = agreement.links?.find(
      (link: PayPalLink) => link.rel === "approval_url",
    )?.href;
    if (!approvalUrl) {
      console.error("No approval URL found in response:", agreement);
      return new NextResponse("No approval URL found", { status: 500 });
    }

    return NextResponse.json({ approvalUrl });
  } catch (error) {
    console.error("Error creating PayPal agreement:", error);
    return new NextResponse("Error creating PayPal agreement", { status: 500 });
  }
}
