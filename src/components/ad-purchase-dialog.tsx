"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AuthButton } from "@/components/auth-button";
import { CreditCard, Plus } from "lucide-react";
import { useMarqueeAds } from "./marquee-ads";

const AD_PRICE = 500;

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string,
);

// Form to collect ad content before payment
const AdContentForm = ({
  onProceed,
  isLoading,
}: {
  onProceed: (content: string) => void;
  isLoading: boolean;
}) => {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      setError("Ad content is required");
      return;
    }

    if (content.length > 50) {
      setError("Ad content must be 50 characters or less");
      return;
    }

    onProceed(content);
  };

  if (!session) {
    return (
      <div className="text-center p-4">
        <p className="mb-4 text-gray-300">
          Please sign in to purchase ad space
        </p>
        <AuthButton />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-400 mb-2">
        ${AD_PRICE}/month for your ad to appear in the marquee (limit 50
        characters)
      </p>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="space-y-2">
        <label className="text-sm font-medium text-purple-300">
          Ad Content
        </label>
        <Textarea
          value={content}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setContent(e.target.value)
          }
          placeholder="Enter your ad text (max 50 characters)"
          maxLength={50}
          className="w-full bg-gray-800 border-gray-700 text-white focus:border-purple-500"
          required
        />
        <p className="text-xs text-gray-400 text-right">
          {content.length}/50 characters
        </p>
      </div>

      <Button
        type="submit"
        disabled={isLoading || !content.trim() || content.length > 50}
        className="w-full bg-purple-600 hover:bg-purple-700"
      >
        {isLoading ? (
          <span className="flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            Processing...
          </span>
        ) : (
          "Continue to Payment"
        )}
      </Button>
    </form>
  );
};

// Payment form that appears after ad content is submitted
const PaymentForm = ({
  onSuccess,
}: {
  clientSecret: string;
  onSuccess: () => void;
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stripe = useStripe();
  const elements = useElements();

  // Function to poll for updates
  const pollForUpdates = useCallback(async () => {
    setIsPolling(true);
    let attempts = 0;
    const maxAttempts = 10;

    const checkStatus = async () => {
      try {
        // Check if the ad has been updated
        const response = await fetch("/api/ads");
        if (response.ok) {
          const data = await response.json();
          // If we have ads, consider it a success
          if (data.ads && data.ads.length > 0) {
            setIsPolling(false);
            onSuccess();
            return;
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          // Try again in 2 seconds
          setTimeout(checkStatus, 2000);
        } else {
          // After max attempts, just call success anyway
          setIsPolling(false);
          onSuccess();
        }
      } catch (err) {
        console.error("Error polling for updates:", err);
        // If polling fails, still consider it a success
        setIsPolling(false);
        onSuccess();
      }
    };

    // Start polling
    checkStatus();
  }, [onSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        throw new Error(submitError.message);
      }

      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: "if_required",
      });

      if (error) {
        throw new Error(error.message);
      }

      // Start polling for updates
      pollForUpdates();
    } catch (err: unknown) {
      console.error("Payment error:", err);
      setError(err instanceof Error ? err.message : "Payment failed");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-400 mb-2">
        ${AD_PRICE}/month for your ad to appear in the marquee
      </p>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <PaymentElement />

      <Button
        type="submit"
        disabled={!stripe || isLoading || isPolling}
        className="w-full bg-purple-600 hover:bg-purple-700"
      >
        {isLoading ? (
          <span className="flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            Processing...
          </span>
        ) : isPolling ? (
          <span className="flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            Updating...
          </span>
        ) : (
          <span className="flex items-center justify-center">
            <CreditCard className="h-4 w-4 mr-2" />
            Subscribe
          </span>
        )}
      </Button>

      <div className="text-xs text-gray-400 text-center">
        Your payment is processed securely by Stripe.
      </div>
    </form>
  );
};

export function AdPurchaseDialog() {
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const marqueeAds = useMarqueeAds();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setSuccess(false);
        setClientSecret(null);
        setError(null);
      }, 300);
    }
  }, [open]);

  const handleSuccess = () => {
    setSuccess(true);
    // Force refresh the marquee ads
    marqueeAds.refreshAds();

    setTimeout(() => {
      setOpen(false);
    }, 2000);
  };

  const handleProceedToPayment = async (content: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Create subscription
      const response = await fetch("/api/ads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create subscription");
      }

      const { clientSecret } = await response.json();
      setClientSecret(clientSecret);
    } catch (err: unknown) {
      console.error("Error creating subscription:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create subscription",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 px-2 py-1 h-auto"
          id="ad-purchase"
        >
          <Plus className="h-3 w-3 mr-1" />
          Advertise
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto bg-gray-900 text-white border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-purple-300">
            {success ? "Subscription Successful!" : "Purchase Ad Space"}
          </DialogTitle>
          {!success && (
            <DialogDescription className="text-gray-400">
              Your ad will appear in the marquee at the bottom of the page.
            </DialogDescription>
          )}
        </DialogHeader>

        {success ? (
          <div className="text-center py-4">
            <p className="text-green-500">
              Your ad has been successfully created and will appear in the
              marquee shortly! Refresh the page to see your ad.
            </p>
          </div>
        ) : isLoading ? (
          <div className="text-center py-4">
            <div className="flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-300">Processing your request...</p>
            </div>
          </div>
        ) : error ? (
          <div className="space-y-4">
            <p className="text-red-500">{error}</p>
            <Button
              onClick={() => setError(null)}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              Try Again
            </Button>
          </div>
        ) : clientSecret ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "night",
                variables: {
                  colorPrimary: "#9333ea",
                  colorBackground: "#1f2937",
                  colorText: "#ffffff",
                  colorDanger: "#ef4444",
                  fontFamily: "system-ui, sans-serif",
                  spacingUnit: "4px",
                  borderRadius: "8px",
                },
              },
            }}
          >
            <PaymentForm
              clientSecret={clientSecret}
              onSuccess={handleSuccess}
            />
          </Elements>
        ) : (
          <AdContentForm
            onProceed={handleProceedToPayment}
            isLoading={isLoading}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
