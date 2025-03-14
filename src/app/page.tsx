"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { AuthButton } from "@/components/auth-button";
import { BarChart3, Info } from "lucide-react";
import Link from "next/link";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState as usePaymentState } from "react";
import { PayPalSetupDialog } from "@/components/paypal-setup-dialog";
import { MarqueeAds } from "@/components/marquee-ads";
import { AdPurchaseDialog } from "@/components/ad-purchase-dialog";
import { CreditCard } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FloatingNumber {
  id: number;
  text: string;
  x: number;
  y: number;
  opacity: number;
}

interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  opacity: number;
}

const AnimatedDigit = ({ digit }: { digit: string }) => (
  <div className="relative inline-block w-[1ch] h-[1.2em] overflow-hidden">
    <div className="absolute inset-0">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={digit}
          className="absolute inset-0 flex items-center justify-center"
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          transition={{
            y: { type: "spring", stiffness: 300, damping: 30 },
          }}
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </div>
  </div>
);

const AnimatedNumber = ({ number }: { number: string }) => {
  const digits = useMemo(() => {
    return number.replace(/\B(?=(\d{3})+(?!\d))/g, ",").split("");
  }, [number]);

  const fontSize = useMemo(() => {
    const numDigits = number.length;
    if (numDigits <= 8) return "text-8xl";
    if (numDigits <= 12) return "text-7xl";
    if (numDigits <= 16) return "text-6xl";
    if (numDigits <= 20) return "text-5xl";
    return "text-4xl";
  }, [number]);

  return (
    <div
      className={`${fontSize} font-bold tabular-nums flex max-w-[90vw] flex-wrap justify-center text-purple-300`}
    >
      {digits.map((digit, i) => (
        <AnimatedDigit key={`${i}-${digit}`} digit={digit} />
      ))}
    </div>
  );
};

const FloatingText = ({ text }: { text: string }) => (
  <motion.div
    className={`absolute left-1/2 text-xl ${
      text.includes("×") ? "text-green-500" : "text-purple-500"
    }`}
    initial={{ y: 0, x: Math.random() * 60 - 30, opacity: 1 }}
    animate={{ y: -100, opacity: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 1, ease: "easeOut" }}
  >
    {text}
  </motion.div>
);

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
);

const PaymentForm = ({
  onSuccess,
  amount,
  setAmount,
}: {
  onSuccess: (amount: number, paymentIntentId: string) => void;
  amount: number;
  setAmount: (amount: number) => void;
}) => {
  const [isProcessing, setIsProcessing] = usePaymentState(false);
  const [loadError, setLoadError] = usePaymentState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState(amount.toString());
  const stripe = useStripe();
  const elements = useElements();

  // Validate amount whenever it changes
  useEffect(() => {
    const numValue = Number(inputValue);
    if (inputValue === "") {
      setError("Please enter an amount");
    } else if (numValue < 1) {
      setError("Amount must be at least $1");
    } else if (!Number.isInteger(numValue)) {
      setError("Amount must be a whole number");
    } else {
      setError(null);
    }
  }, [inputValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numValue = Number(inputValue);
    if (!stripe || !elements || numValue < 1 || !Number.isInteger(numValue))
      return;

    setIsProcessing(true);
    try {
      const { paymentIntent, error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin,
        },
        redirect: "if_required",
      });

      if (error) {
        console.error("Payment error:", error);
      } else if (paymentIntent.status === "succeeded") {
        onSuccess(amount, paymentIntent.id);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle input change to only allow whole numbers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Only allow digits (no decimals)
    if (value === "" || /^[0-9]+$/.test(value)) {
      setInputValue(value);
      if (value !== "") {
        setAmount(Number(value));
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
      {(error || loadError) && (
        <div className="text-red-500 text-sm">{error || loadError}</div>
      )}
      <div className="space-y-2">
        <label className="text-sm font-medium text-purple-300">
          Multiplication Amount ($)
        </label>
        <Input
          type="number"
          min="1"
          step="1"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            // Prevent decimal input by blocking the period/decimal key
            if (e.key === "." || e.key === ",") {
              e.preventDefault();
            }
          }}
          className="w-full bg-gray-800 border-gray-700 text-white focus:border-purple-500"
        />
      </div>
      <PaymentElement onLoadError={() => setLoadError("blocked")} />
      <Button
        type="submit"
        disabled={
          !stripe ||
          isProcessing ||
          inputValue === "" ||
          Number(inputValue) < 1 ||
          !Number.isInteger(Number(inputValue))
        }
        className="w-full bg-purple-600 hover:bg-purple-700 flex items-center justify-center"
      >
        {isProcessing ? (
          <span className="flex items-center">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            Processing...
          </span>
        ) : (
          <span className="flex items-center">
            <CreditCard className="h-4 w-4 mr-2" />
            Pay & Multiply
          </span>
        )}
      </Button>
      <div className="text-xs text-gray-400 text-center">
        Your payment is processed securely by Stripe.
      </div>
    </form>
  );
};

export default function Home() {
  const { data: session } = useSession();
  const [count, setCount] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [floatingNumbers, setFloatingNumbers] = useState<FloatingNumber[]>([]);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const floatingIdCounterRef = useRef(0);
  const [retryCount, setRetryCount] = useState(0);
  const [location, setLocation] = useState<{
    country_code: string;
    country_name: string;
  } | null>(null);
  const [showPayment, setShowPayment] = usePaymentState(false);
  const [clientSecret, setClientSecret] = usePaymentState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = usePaymentState(2);
  const [showPayPalSetup, setShowPayPalSetup] = useState(false);
  const [hasPayPalSetup, setHasPayPalSetup] = useState(false);
  const [hasAds, setHasAds] = useState(false);

  // WebSocket connection for counter
  useEffect(() => {
    const getBackoffTime = (retryCount: number) =>
      Math.min(1000 * Math.pow(2, retryCount), 30000);

    let ws: WebSocket | null = null;

    // Define pingServer inside the effect to avoid dependency issues
    const pingServer = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    };

    const connect = () => {
      // Close existing connection if any
      if (ws) {
        console.log("Sending close message: Reconnecting to WebSocket");
        ws.close(1000, "Reconnecting");
      }

      // Determine the WebSocket URL based on environment
      const wsUrl =
        process.env.NODE_ENV === "development"
          ? "ws://localhost:8080/ws"
          : `wss://${process.env.NEXT_PUBLIC_WS_HOST}/ws`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnecting(false);
        setSocket(ws);
        setRetryCount(0);
        setError(null);

        // Request viewer count immediately upon connection
        ws?.send(JSON.stringify({ type: "get_viewer_count" }));
      };

      ws.onclose = (event) => {
        if (event.wasClean) {
          console.log(
            `Connection closed cleanly, code=${event.code} reason=${event.reason}`,
          );
        } else {
          console.error("Connection died");
        }

        setIsConnecting(true);

        // Reconnect with exponential backoff
        const reconnectTimer = setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          connect();
        }, getBackoffTime(retryCount));
        return () => clearTimeout(reconnectTimer);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setError("Connection error");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle counter updates
          if (data.type === "count") {
            const countStr = data.count.toString();
            setCount((prevCount) => {
              // Only update if different to avoid unnecessary re-renders
              if (prevCount !== countStr) {
                return countStr;
              }
              return prevCount;
            });

            if (data.operation) {
              setFloatingNumbers((prev) => [
                ...prev,
                createFloatingNumber(data.operation, data.multiply_amount),
              ]);
            }
          }

          // Handle viewer count updates
          if (data.type === "viewer_count") {
            setViewerCount(parseInt(data.count, 10));
          }

          // Handle error messages
          if (data.type === "error") {
            console.error("Server error:", data.count);
            setError(data.count);
            // Clear error after 5 seconds
            setTimeout(() => setError(null), 5000);
          }

          // Handle rate limit messages
          if (data.type === "rate_limited") {
            console.warn("Rate limited:", data.count);
            setError(data.count);
            // Clear error after 5 seconds
            setTimeout(() => setError(null), 5000);
          }
        } catch (error) {
          console.error("Error parsing message:", error);
        }
      };
    };

    connect();

    // Set up ping to keep session alive
    const pingInterval = setInterval(() => {
      pingServer();

      // Also request viewer count update from server
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "get_viewer_count" }));
      }
    }, 5000);

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        (!ws || ws.readyState !== WebSocket.OPEN)
      ) {
        // Reconnect when tab becomes visible again
        connect();
      }
    };

    // Handle before unload
    const handleBeforeUnload = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Send a clean close message
        console.log("Sending close message: Page navigation/unload");
        ws.send(
          JSON.stringify({ type: "close", reason: "Page navigation/unload" }),
        );
        ws.close(1000, "Page navigation");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearInterval(pingInterval);
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log("Sending close message: Component unmounting");
        ws.send(
          JSON.stringify({ type: "close", reason: "Component unmounting" }),
        );
        ws.close(1000, "Component unmounting");
      }
    };
  }, [retryCount]);

  const createFloatingNumber = (
    operation: "increment" | "multiply",
    multiplyAmount?: number,
  ) => {
    floatingIdCounterRef.current += 1;
    return {
      id: floatingIdCounterRef.current,
      text: operation === "increment" ? "+1" : `×${multiplyAmount || 2}`,
      x: Math.random() * 60 - 30,
      y: 0,
      opacity: 1,
    };
  };

  // Get user's location using browser geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}&localityLanguage=en`,
          );
          const data = await response.json();
          setLocation({
            country_code: data.countryCode,
            country_name: data.countryName,
          });
        } catch (error) {
          console.error("Error getting location:", error);
          setLocation({ country_code: "US", country_name: "United States" });
        }
      });
    }
  }, []);

  const handlePaymentSuccess = (amount: number, paymentIntentId: string) => {
    setShowPayment(false);
    setClientSecret(null);
    performOperation("multiply", amount, paymentIntentId);
  };

  const performOperation = useCallback(
    async (
      operation: "increment" | "multiply",
      amount?: number,
      paymentIntentId?: string,
    ) => {
      if (!socket || socket.readyState !== WebSocket.OPEN || isLoading) {
        return;
      }

      setIsLoading(true);
      try {
        // Log session data to help with debugging
        console.log("Session data for attribution:", {
          id: session?.user?.id,
          email: session?.user?.email,
          name: session?.user?.name,
        });

        // Determine the best user identifier to send
        let userId;
        if (session?.user) {
          // Try ID first, then email as fallback
          userId = session.user.id
            ? String(session.user.id)
            : session.user.email
              ? session.user.email
              : undefined;

          console.log("Using user identifier for attribution:", userId);
        }

        const message = {
          type: "increment",
          country_code: location?.country_code || "",
          country_name: location?.country_name || "",
          user_id: userId,
          amount: count ?? "0",
          operation,
          multiply_amount: amount,
          payment_intent_id: paymentIntentId,
        };

        console.log("Sending increment message:", message);
        socket.send(JSON.stringify(message));
      } catch (error) {
        console.error("Error sending operation:", error);
        setError("Failed to perform operation");
      } finally {
        setTimeout(() => setIsLoading(false), 100);
      }
    },
    [socket, isLoading, count, session?.user, location],
  );

  const handleMultiplyClick = async () => {
    if (!session?.user) {
      setError("Please sign in to use the multiply feature");
      return;
    }

    try {
      const response = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: paymentAmount }),
      });

      if (!response.ok) {
        console.error("Payment intent creation failed:", await response.text());
        setError("Failed to initialize payment. Please try again.");
        return;
      }

      const { clientSecret, error } = await response.json();
      if (error) {
        console.error("Error:", error);
        setError("Failed to initialize payment. Please try again.");
        return;
      }

      setClientSecret(clientSecret);
      setShowPayment(true);
    } catch (error) {
      console.error("Error:", error);
      setError("Failed to initialize payment. Please try again.");
    }
  };

  // Add keyboard event listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !isLoading &&
        socket?.readyState === WebSocket.OPEN &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        performOperation("increment");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [socket, isLoading, performOperation]);

  // Add effect to check PayPal setup
  useEffect(() => {
    const checkPayPalSetup = async () => {
      if (session?.user?.email) {
        try {
          const response = await fetch(
            `/api/users/paypal/status?email=${encodeURIComponent(session.user.email)}`,
          );
          if (!response.ok) {
            console.error("Failed to check PayPal status");
            return;
          }

          const { paypal_email } = await response.json();
          setHasPayPalSetup(!!paypal_email);
          // Only show the PayPal setup dialog if the user hasn't set up PayPal
          // and hasn't dismissed the dialog before
          if (!paypal_email) {
            const hasSeenDialog = localStorage.getItem("hasSeenPayPalDialog");
            if (!hasSeenDialog) {
              setShowPayPalSetup(true);
              // Mark as seen so we don't show it automatically again
              localStorage.setItem("hasSeenPayPalDialog", "true");
            }
          }
        } catch (error) {
          console.error("Error checking PayPal setup:", error);
        }
      }
    };

    checkPayPalSetup();
  }, [session]);

  // Check if user has ads
  useEffect(() => {
    const checkUserAds = async () => {
      if (session?.user) {
        try {
          const response = await fetch("/api/ads/has-ads");
          if (!response.ok) {
            throw new Error(`Error checking ads: ${response.status}`);
          }
          const data = await response.json();
          console.log("Has ads response:", data);
          // The API returns hasActiveAds, not hasAds
          setHasAds(data.hasActiveAds || (data.count && data.count > 0));
        } catch (error) {
          console.error("Error checking user ads:", error);
          // If there's an error, we'll assume they might have ads to be safe
          setHasAds(true);
        }
      }
    };

    if (session?.user) {
      checkUserAds();
    }
  }, [session]);

  if (isConnecting || count === null) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-purple-300">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          {error && <div className="text-red-500">{error}</div>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-purple-300 overflow-hidden relative select-none">
      <div className="absolute top-0 pt-4 px-6 z-50 flex items-center justify-between w-full">
        <div className="flex items-center gap-4">
          <AuthButton />
          <Link
            href="/stats"
            className="flex items-center gap-2 rounded-md bg-transparent px-4 py-2 text-sm text-white hover:bg-purple-500/20"
          >
            <BarChart3 className="h-4 w-4" />
            Stats
          </Link>
          <Link
            href="/about"
            className="flex items-center gap-2 rounded-md bg-transparent px-4 py-2 text-sm text-white hover:bg-purple-500/20"
          >
            <Info className="h-4 w-4" />
            About
          </Link>
          {session?.user && hasAds ? (
            <Link
              href="/my-ads"
              className="flex items-center gap-2 rounded-md bg-transparent px-4 py-2 text-sm text-white hover:bg-purple-500/20"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <rect width="18" height="12" x="3" y="6" rx="2" />
                <path d="M3 10h18" />
                <path d="M7 15h2" />
                <path d="M11 15h6" />
              </svg>
              My Ads
            </Link>
          ) : (
            <></>
          )}
          {session?.user ? (
            !hasPayPalSetup && (
              <div className="text-yellow-400 text-sm flex items-center">
                <span>⚠️ Set up PayPal to appear on leaderboard</span>
                <Button
                  variant="link"
                  className="text-yellow-400 underline ml-2 p-0 h-auto"
                  onClick={() => setShowPayPalSetup(true)}
                >
                  Set up now
                </Button>
              </div>
            )
          ) : (
            <div className="text-yellow-400 text-sm">
              ⚠️ Sign in to appear on leaderboard
            </div>
          )}
        </div>

        {/* Viewer count */}
        <div className="flex items-center gap-2 text-green-400">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span>
            {viewerCount} {viewerCount === 1 ? "person" : "people"} watching
          </span>
        </div>
      </div>

      {error && (
        <div className="absolute top-20 left-0 right-0 flex justify-center z-50">
          <div className="bg-red-900/80 text-white px-4 py-3 rounded-md flex items-center gap-3 max-w-md">
            <div className="text-red-300">⚠️</div>
            <div className="flex-1">{error}</div>
            {error.includes("sign in") && !session?.user && (
              <Button
                onClick={() =>
                  document
                    .querySelector<HTMLButtonElement>(
                      '[data-auth-button="true"]',
                    )
                    ?.click()
                }
                variant="outline"
                className="bg-red-800 hover:bg-red-700 border-red-700"
                size="sm"
              >
                Sign In
              </Button>
            )}
            <Button
              onClick={() => setError(null)}
              variant="ghost"
              size="sm"
              className="p-1 h-auto text-red-300 hover:text-white hover:bg-red-800"
            >
              ✕
            </Button>
          </div>
        </div>
      )}

      <div className="relative z-10 w-full px-4">
        <div className="mb-12 flex justify-center relative">
          <div className="absolute inset-x-0 -top-4">
            <AnimatePresence>
              {floatingNumbers.map(({ id, text }) => (
                <FloatingText key={id} text={text} />
              ))}
            </AnimatePresence>
          </div>
          <AnimatedNumber number={count} />
        </div>

        <div className="flex flex-row justify-center items-center gap-4">
          <Button
            onClick={() => performOperation("increment")}
            disabled={
              isLoading || !socket || socket.readyState !== WebSocket.OPEN
            }
            className="text-xl px-8 py-6 h-auto"
          >
            Increment
          </Button>
          <Dialog
            open={showPayment}
            onOpenChange={(open) => {
              if (!open) {
                setClientSecret(null);
              }
              setShowPayment(open);
            }}
          >
            <DialogTrigger asChild>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleMultiplyClick}
                      disabled={
                        isLoading ||
                        !socket ||
                        socket.readyState !== WebSocket.OPEN
                      }
                      className="text-xl px-8 py-6 h-auto bg-green-600 hover:bg-green-500"
                      variant="secondary"
                    >
                      Multiply
                    </Button>
                  </TooltipTrigger>
                  {!session?.user && (
                    <TooltipContent
                      side="bottom"
                      className="bg-gray-800 text-white border-gray-700"
                    >
                      <p>Sign in to use this feature</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 text-white border-gray-800">
              <DialogHeader>
                <DialogTitle className="text-purple-300">
                  Multiply Counter
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                  Pay to multiply the counter by your chosen amount.
                </DialogDescription>
              </DialogHeader>
              {clientSecret && (
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
                    onSuccess={handlePaymentSuccess}
                    amount={paymentAmount}
                    setAmount={setPaymentAmount}
                  />
                </Elements>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <PayPalSetupDialog
        open={showPayPalSetup}
        onOpenChange={setShowPayPalSetup}
      />

      {/* Ad purchase dialog */}
      <div className="fixed bottom-8 right-4">
        <AdPurchaseDialog />
      </div>

      {/* Marquee ads at the bottom */}
      <div className="fixed bottom-0 left-0 right-0">
        <MarqueeAds />
      </div>
    </main>
  );
}
