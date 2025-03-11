import { cache } from "react";

// PayPal API types
interface PayPalAccessTokenResponse {
  access_token: string;
  token_type: string;
  app_id: string;
  expires_in: number;
  nonce: string;
}

export interface PayPalPayoutItem {
  recipient_type: "EMAIL";
  amount: {
    value: string;
    currency: "USD";
  };
  note: string;
  sender_item_id: string;
  receiver: string;
}

interface PayPalPayoutBatchRequest {
  sender_batch_header: {
    sender_batch_id: string;
    email_subject: string;
    email_message: string;
  };
  items: PayPalPayoutItem[];
}

interface PayPalPayoutBatchResponse {
  batch_header: {
    payout_batch_id: string;
    batch_status: string;
    sender_batch_header: {
      sender_batch_id: string;
      email_subject: string;
      email_message: string;
    };
  };
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

interface PayPalPayoutBatchDetailsResponse {
  batch_header: {
    payout_batch_id: string;
    batch_status: string;
    time_created: string;
    time_completed: string;
    sender_batch_header: {
      sender_batch_id: string;
      email_subject: string;
      email_message: string;
    };
    amount: {
      currency: string;
      value: string;
    };
    fees: {
      currency: string;
      value: string;
    };
  };
  items: Array<{
    payout_item_id: string;
    transaction_id: string;
    transaction_status: string;
    payout_item_fee: {
      currency: string;
      value: string;
    };
    payout_batch_id: string;
    payout_item: {
      recipient_type: string;
      amount: {
        currency: string;
        value: string;
      };
      note: string;
      receiver: string;
      sender_item_id: string;
    };
    time_processed: string;
    errors?: {
      name: string;
      message: string;
      details?: Record<string, unknown>;
    };
  }>;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

// Function to get PayPal access token
export const getPayPalAccessToken = cache(async (): Promise<string> => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_SECRET;
  const apiUrl =
    process.env.PAYPAL_API_URL || "https://api-m.sandbox.paypal.com";

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials not configured");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${apiUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get PayPal access token: ${response.status} ${errorText}`,
    );
  }

  const data = (await response.json()) as PayPalAccessTokenResponse;
  return data.access_token;
});

// Function to create a payout batch
export async function createPayPalPayout(
  items: PayPalPayoutItem[],
  emailSubject: string,
  emailMessage: string,
): Promise<PayPalPayoutBatchResponse> {
  const accessToken = await getPayPalAccessToken();
  const apiUrl =
    process.env.PAYPAL_API_URL || "https://api-m.sandbox.paypal.com";

  // Generate a unique batch ID
  const batchId = `BATCH_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const payoutRequest: PayPalPayoutBatchRequest = {
    sender_batch_header: {
      sender_batch_id: batchId,
      email_subject: emailSubject,
      email_message: emailMessage,
    },
    items,
  };

  const response = await fetch(`${apiUrl}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payoutRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create PayPal payout: ${response.status} ${errorText}`,
    );
  }

  return (await response.json()) as PayPalPayoutBatchResponse;
}

// Function to get payout batch details
export async function getPayPalPayoutDetails(
  payoutBatchId: string,
): Promise<PayPalPayoutBatchDetailsResponse> {
  const accessToken = await getPayPalAccessToken();
  const apiUrl =
    process.env.PAYPAL_API_URL || "https://api-m.sandbox.paypal.com";

  const response = await fetch(
    `${apiUrl}/v1/payments/payouts/${payoutBatchId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get PayPal payout details: ${response.status} ${errorText}`,
    );
  }

  return (await response.json()) as PayPalPayoutBatchDetailsResponse;
}
