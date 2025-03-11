"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Edit2, X, Check, RefreshCw, CreditCard, Trash2 } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Elements } from "@stripe/react-stripe-js";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// Initialize Stripe
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string,
);

interface Ad {
  id: string;
  content: string;
  created_at: string;
  expires_at: string;
  active: boolean;
  stripe_subscription_id: string;
  auto_renew?: boolean;
}

interface PriceInfo {
  priceId: string;
  amount: string;
  interval: string;
  currency: string;
}

// Payment form component that uses Stripe Elements
function CheckoutForm({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clientSecret, // Required for type checking, used by Stripe Elements
  onSuccess,
  onError,
  amount,
  currency,
}: {
  clientSecret: string;
  onSuccess: () => void;
  onError: (message: string) => void;
  amount: string;
  currency: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  // Function to poll for updates
  const pollForUpdates = useCallback(async () => {
    setIsPolling(true);
    let attempts = 0;
    const maxAttempts = 10;

    const checkStatus = async () => {
      try {
        // Check if the ad has been updated
        const response = await fetch("/api/ads/my-ads");
        if (response.ok) {
          const data = await response.json();
          // If we have ads and they're active, consider it a success
          if (data.ads && data.ads.length > 0) {
            const updatedAds = data.ads.filter((ad: Ad) => ad.active);
            if (updatedAds.length > 0) {
              setIsPolling(false);
              onSuccess();
              return;
            }
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

    setIsProcessing(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + "/my-ads",
        },
        redirect: "if_required",
      });

      if (error) {
        onError(error.message || "Payment failed");
      } else {
        // Start polling for updates if payment was successful
        pollForUpdates();
      }
    } catch (err) {
      onError("An unexpected error occurred");
      console.error("Payment error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <PaymentElement />
      </div>
      <div className="mb-4 text-center">
        <p className="text-purple-300 font-semibold">
          Total: {amount} {currency.toUpperCase()}
        </p>
      </div>
      <Button
        type="submit"
        disabled={!stripe || !elements || isProcessing || isPolling}
        className="w-full bg-purple-600 hover:bg-purple-700"
      >
        {isProcessing ? (
          <span className="flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            Processing...
          </span>
        ) : isPolling ? (
          <span className="flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            Updating subscription...
          </span>
        ) : (
          <span className="flex items-center justify-center">
            <CreditCard className="h-4 w-4 mr-2" />
            Pay Now
          </span>
        )}
      </Button>
    </form>
  );
}

export default function MyAdsPage() {
  const { status } = useSession();
  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingAutoRenewId, setUpdatingAutoRenewId] = useState<string | null>(
    null,
  );
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(
    null,
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("usd");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [currentAdId, setCurrentAdId] = useState<string | null>(null); // Tracks which ad is being renewed

  const fetchPriceInfo = async () => {
    try {
      const response = await fetch("/api/ads/price");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch price information");
      }

      const data = await response.json();
      setPriceInfo(data);
    } catch (err) {
      console.error("Error fetching price information:", err);
      // Don't show an error toast here, just log it
    }
  };

  const fetchMyAds = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/ads/my-ads");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch ads");
      }

      const data = await response.json();
      setAds(data.ads || []);
    } catch (err) {
      console.error("Error fetching ads:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch your ads");
    } finally {
      setIsLoading(false);
    }
  };

  const cancelSubscription = async (subscriptionId: string) => {
    try {
      setCancellingId(subscriptionId);
      const response = await fetch("/api/ads/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to cancel subscription");
      }

      // Update the local state to reflect the cancellation
      setAds(
        ads.map((ad) =>
          ad.stripe_subscription_id === subscriptionId
            ? { ...ad, active: false, auto_renew: false }
            : ad,
        ),
      );

      toast.success("Your ad subscription has been successfully cancelled.");
    } catch (err) {
      console.error("Error cancelling subscription:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to cancel subscription",
      );
    } finally {
      setCancellingId(null);
    }
  };

  const toggleAutoRenew = async (
    subscriptionId: string,
    currentAutoRenew: boolean,
  ) => {
    try {
      setUpdatingAutoRenewId(subscriptionId);
      const newAutoRenewValue = !currentAutoRenew;

      const response = await fetch("/api/ads/toggle-auto-renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId,
          autoRenew: newAutoRenewValue,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Failed to update auto-renewal setting",
        );
      }

      // Update the local state to reflect the change
      setAds(
        ads.map((ad) =>
          ad.stripe_subscription_id === subscriptionId
            ? { ...ad, auto_renew: newAutoRenewValue }
            : ad,
        ),
      );

      toast.success(
        `Auto-renewal has been ${newAutoRenewValue ? "enabled" : "disabled"}.`,
      );
    } catch (err) {
      console.error("Error updating auto-renewal:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to update auto-renewal setting",
      );
    } finally {
      setUpdatingAutoRenewId(null);
    }
  };

  const renewSubscription = async (adId: string) => {
    try {
      setRenewingId(adId);

      const response = await fetch("/api/ads/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to renew subscription");
      }

      const data = await response.json();

      // Set payment details and open payment modal
      setPaymentClientSecret(data.clientSecret);
      setPaymentAmount(data.amount.toString());
      setPaymentCurrency(data.currency);
      setPaymentModalOpen(true);
    } catch (err) {
      console.error("Error renewing subscription:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to renew subscription",
      );
    } finally {
      setRenewingId(null);
    }
  };

  const handlePaymentSuccess = () => {
    setPaymentModalOpen(false);
    setPaymentClientSecret(null);
    toast.success(
      "Your ad subscription has been renewed! Refreshing your ads...",
    );
    fetchMyAds();
  };

  const handlePaymentError = (message: string) => {
    toast.error(`Payment failed: ${message}`);
  };

  const handlePaymentModalClose = () => {
    setPaymentModalOpen(false);
    setPaymentClientSecret(null);
  };

  const startEditing = (ad: Ad) => {
    setEditingAdId(ad.id);
    setEditedContent(ad.content);
  };

  const cancelEditing = () => {
    setEditingAdId(null);
    setEditedContent("");
  };

  const updateAdContent = async (adId: string) => {
    try {
      setIsUpdating(true);
      const response = await fetch("/api/ads/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId: adId,
          content: editedContent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update ad");
      }

      // Update the local state to reflect the changes
      setAds(
        ads.map((ad) =>
          ad.id === adId ? { ...ad, content: editedContent } : ad,
        ),
      );

      setEditingAdId(null);
      setEditedContent("");
      toast.success("Your ad has been updated successfully.");
    } catch (err) {
      console.error("Error updating ad:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update ad");
    } finally {
      setIsUpdating(false);
    }
  };

  // Function to delete an ad
  const deleteAd = async (adId: string) => {
    try {
      setDeletingId(adId);
      const response = await fetch("/api/ads/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete ad");
      }

      // Remove the ad from the local state
      setAds(ads.filter((ad) => ad.id !== adId));
      toast.success("Your ad has been successfully deleted.");
    } catch (err) {
      console.error("Error deleting ad:", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete ad");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchMyAds();
      fetchPriceInfo();
    }
  }, [status]);

  if (status === "loading" || isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-10 px-4">
        <div className="w-full max-w-3xl">
          <h1 className="text-3xl font-bold mb-6 text-center text-purple-300">
            My Ad Subscriptions
          </h1>
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-10 px-4">
        <div className="w-full max-w-3xl">
          <h1 className="text-3xl font-bold mb-6 text-center text-purple-300">
            My Ad Subscriptions
          </h1>
          <Alert className="bg-gray-900 border-purple-800 text-white">
            <AlertDescription>
              Please{" "}
              <Link
                href="/api/auth/signin"
                className="text-purple-400 underline"
              >
                sign in
              </Link>{" "}
              to view your ad subscriptions.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-10 px-4">
      <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-bold mb-6 text-center text-purple-300">
          My Ad Subscriptions
        </h1>

        {priceInfo && (
          <div className="text-center mb-6">
            <p className="text-gray-400">
              Current ad pricing:{" "}
              <span className="text-purple-300 font-semibold">
                {priceInfo.amount}
              </span>{" "}
              per {priceInfo.interval}
            </p>
          </div>
        )}

        {error && (
          <Alert className="mb-6 bg-red-900 border-red-800 text-white">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {ads.length === 0 ? (
          <div className="text-center py-10 bg-gray-900 rounded-lg p-8">
            <p className="text-gray-400 mb-4">
              You don&apos;t have any ad subscriptions yet.
            </p>
            <Button asChild className="bg-purple-600 hover:bg-purple-700">
              <Link href="/">Purchase Your First Ad</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {ads.map((ad) => (
              <Card
                key={ad.id}
                className="bg-gray-900 border-gray-800 text-white shadow-purple-900/20 shadow-lg"
              >
                <CardHeader className="border-b border-gray-800">
                  <CardTitle className="flex justify-between items-center">
                    <span className="text-purple-300">
                      Ad #{ad.id.substring(0, 8)}
                    </span>
                    <span
                      className={`text-sm px-3 py-1 rounded-full ${
                        ad.active
                          ? "bg-purple-900 text-purple-200"
                          : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {ad.active ? "Active" : "Inactive"}
                    </span>
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    Created {formatDistanceToNow(new Date(ad.created_at))} ago
                    {priceInfo && (
                      <span className="ml-2">
                        • {priceInfo.amount}/{priceInfo.interval}
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="p-4 bg-gray-800 rounded-md">
                    {editingAdId === ad.id ? (
                      <div className="space-y-3">
                        <Input
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          maxLength={50}
                          className="bg-gray-700 border-gray-600 text-white focus:border-purple-500"
                          autoFocus
                        />
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-gray-400">
                            {editedContent.length}/50 characters
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditing}
                              className="text-gray-400 hover:text-white hover:bg-gray-700"
                              disabled={isUpdating}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => updateAdContent(ad.id)}
                              disabled={
                                isUpdating ||
                                editedContent.length === 0 ||
                                editedContent === ad.content
                              }
                              className="bg-purple-600 hover:bg-purple-700"
                            >
                              {isUpdating ? (
                                "Saving..."
                              ) : (
                                <>
                                  <Check className="h-4 w-4 mr-1" />
                                  Save
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <p className="text-purple-300 font-medium">
                          {ad.content}
                        </p>
                        {ad.active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-purple-300 hover:text-purple-100 hover:bg-purple-900/30"
                            onClick={() => startEditing(ad)}
                          >
                            <Edit2 className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {ad.active && (
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm text-gray-400 flex items-center">
                        <span>
                          {ad.auto_renew ? "Renews" : "Expires"}:{" "}
                          {new Date(ad.expires_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id={`auto-renew-${ad.id}`}
                          checked={ad.auto_renew}
                          onCheckedChange={() =>
                            toggleAutoRenew(
                              ad.stripe_subscription_id,
                              !!ad.auto_renew,
                            )
                          }
                          disabled={
                            updatingAutoRenewId === ad.stripe_subscription_id
                          }
                          className="data-[state=checked]:bg-purple-600"
                        />
                        <Label
                          htmlFor={`auto-renew-${ad.id}`}
                          className={`text-sm ${ad.auto_renew ? "text-purple-300" : "text-gray-400"}`}
                        >
                          {updatingAutoRenewId === ad.stripe_subscription_id ? (
                            <span className="flex items-center">
                              <div className="w-3 h-3 border-2 border-purple-300 border-t-transparent rounded-full animate-spin mr-1" />
                              Updating...
                            </span>
                          ) : (
                            `Auto-renew ${ad.auto_renew ? "enabled" : "disabled"}`
                          )}
                        </Label>
                      </div>
                    </div>
                  )}

                  {!ad.active && (
                    <div className="mt-4 text-sm text-gray-400">
                      <p>Subscription ended</p>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="border-t border-gray-800 pt-4 flex justify-between">
                  {ad.active ? (
                    <Button
                      variant="destructive"
                      onClick={() =>
                        cancelSubscription(ad.stripe_subscription_id)
                      }
                      disabled={cancellingId === ad.stripe_subscription_id}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {cancellingId === ad.stripe_subscription_id
                        ? "Cancelling..."
                        : "Cancel Subscription"}
                    </Button>
                  ) : (
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => renewSubscription(ad.id)}
                        disabled={renewingId === ad.id || deletingId === ad.id}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {renewingId === ad.id ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Renew Subscription
                          </>
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => deleteAd(ad.id)}
                        disabled={deletingId === ad.id || renewingId === ad.id}
                      >
                        {deletingId === ad.id ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {priceInfo && (
                    <div className="text-sm text-gray-400">
                      {priceInfo.amount}/{priceInfo.interval}
                    </div>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Payment Modal */}
      <Dialog open={paymentModalOpen} onOpenChange={handlePaymentModalClose}>
        <DialogContent className="bg-gray-900 text-white border-gray-800 sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-purple-300">
              Complete Your Payment
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Renew your ad subscription to keep your ad visible.
            </DialogDescription>
          </DialogHeader>

          {paymentClientSecret && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: paymentClientSecret,
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
              <CheckoutForm
                clientSecret={paymentClientSecret}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
                amount={paymentAmount}
                currency={paymentCurrency}
              />
            </Elements>
          )}

          <DialogFooter className="flex flex-col space-y-2">
            <div className="text-xs text-gray-400 text-center">
              Your payment is processed securely by Stripe.
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
