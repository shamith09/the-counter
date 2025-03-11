"use client";

import { useState, useEffect } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Edit2, X, Check, RefreshCw } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";

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

export default function MyAdsPage() {
  const { data: session, status } = useSession();
  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [updatingAutoRenewId, setUpdatingAutoRenewId] = useState<string | null>(
    null,
  );
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);

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
            ? { ...ad, active: false }
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
      const stripe = await stripePromise;

      if (!stripe) {
        throw new Error("Stripe failed to initialize");
      }

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

      // Redirect to Stripe checkout
      const { error } = await stripe.confirmCardPayment(data.clientSecret);

      if (error) {
        throw new Error(error.message || "Payment failed");
      }

      toast.success(
        "Your ad subscription has been renewed! Refreshing your ads...",
      );

      // Refresh the ads list
      await fetchMyAds();
    } catch (err) {
      console.error("Error renewing subscription:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to renew subscription",
      );
    } finally {
      setRenewingId(null);
    }
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

  useEffect(() => {
    if (status === "authenticated") {
      fetchMyAds();
      fetchPriceInfo();
    }
  }, [status]);

  if (status === "loading" || isLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center py-10 px-4">
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
      <div className="min-h-screen bg-black flex flex-col items-center justify-center py-10 px-4">
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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center py-10 px-4">
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
              You don't have any ad subscriptions yet.
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
                          Expires:{" "}
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
                    <Button
                      onClick={() => renewSubscription(ad.id)}
                      disabled={renewingId === ad.id}
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
    </div>
  );
}
