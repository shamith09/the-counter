/**
 * Twitter API utilities for counter-bot
 */

import crypto from "crypto";

/**
 * Post a tweet using the Twitter API v2 with OAuth 1.0a
 */
export async function postTweet(
  text: string,
): Promise<{ data: { id: string; text: string } }> {
  const oauth_consumer_key = process.env.TWITTER_API_KEY;
  const oauth_consumer_secret = process.env.TWITTER_API_KEY_SECRET;
  const oauth_token = process.env.TWITTER_ACCESS_TOKEN;
  const oauth_token_secret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

  if (
    !oauth_consumer_key ||
    !oauth_consumer_secret ||
    !oauth_token ||
    !oauth_token_secret
  ) {
    throw new Error("Twitter API credentials not configured");
  }

  // Generate OAuth parameters
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();

  // Create parameter string
  const parameters = {
    oauth_consumer_key,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token,
    oauth_version: "1.0",
  };

  // Create signature base
  const method = "POST";
  const url = "https://api.twitter.com/2/tweets";
  const paramString = Object.keys(parameters)
    .sort()
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(parameters[key as keyof typeof parameters])}`,
    )
    .join("&");

  const signatureBase = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;

  // Create signing key
  const signingKey = `${encodeURIComponent(oauth_consumer_secret)}&${encodeURIComponent(oauth_token_secret)}`;

  // Generate signature
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(signatureBase)
    .digest("base64");

  // Create authorization header
  const authHeader = `OAuth oauth_consumer_key="${oauth_consumer_key}",oauth_token="${oauth_token}",oauth_signature_method="HMAC-SHA1",oauth_timestamp="${timestamp}",oauth_nonce="${nonce}",oauth_version="1.0",oauth_signature="${encodeURIComponent(signature)}"`;

  // Post the tweet
  const response = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Twitter API error (${response.status}): ${errorData}`);
  }

  return await response.json();
}

/**
 * Generate a random nonce for OAuth
 */
function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}
