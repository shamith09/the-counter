import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Bell } from "lucide-react";

interface EmailSubscriptionDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface SubscriptionPreferences {
  counterUpdates: boolean;
  winner24h: boolean;
  winner1h: boolean;
  leaderboardChanges: boolean;
}

export function EmailSubscriptionDialog({
  open,
  onOpenChange,
}: EmailSubscriptionDialogProps) {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [email, setEmail] = useState("");
  const [preferences, setPreferences] = useState<SubscriptionPreferences>({
    counterUpdates: false,
    winner24h: false,
    winner1h: false,
    leaderboardChanges: false,
  });

  // Use controlled open state if provided
  useEffect(() => {
    if (open !== undefined) {
      setIsOpen(open);
    }
  }, [open]);

  // Populate email from session if available
  useEffect(() => {
    if (session?.user?.email) {
      setEmail(session.user.email);
      // Get current subscription status
      fetchCurrentStatus(session.user.email);
    }
  }, [session?.user?.email]);

  const fetchCurrentStatus = async (email: string) => {
    try {
      const response = await fetch(
        `/api/email-subscriptions/status?email=${encodeURIComponent(email)}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data.subscribed) {
          setPreferences({
            counterUpdates: data.preferences.counterUpdates,
            winner24h: data.preferences.winner24h,
            winner1h: data.preferences.winner1h,
            leaderboardChanges: data.preferences.leaderboardChanges,
          });
        }
      }
    } catch (err) {
      console.error("Error fetching subscription status:", err);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setIsOpen(newOpen);
    if (onOpenChange) {
      onOpenChange(newOpen);
    }

    // Reset message when dialog closes
    if (!newOpen) {
      setMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/email-subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          subscribeCounterUpdates: preferences.counterUpdates,
          subscribeWinner24h: preferences.winner24h,
          subscribeWinner1h: preferences.winner1h,
          subscribeLeaderboardChanges: preferences.leaderboardChanges,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage({
          text: data.message || "Successfully updated subscription preferences",
          type: "success",
        });
      } else {
        setMessage({
          text: data.error || "Failed to update subscription preferences",
          type: "error",
        });
      }
    } catch (err) {
      console.error("Error updating subscription:", err);
      setMessage({
        text: "An error occurred while processing your request",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          className="flex items-center gap-1 rounded-md bg-transparent px-2 sm:px-3 py-1.5 text-sm text-white hover:bg-purple-500/20"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span>Notifications</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl text-purple-300">
            Email Notifications
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Choose which events you want to receive email notifications for.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm text-gray-300">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="counterUpdates"
                checked={preferences.counterUpdates}
                onCheckedChange={(checked) =>
                  setPreferences({
                    ...preferences,
                    counterUpdates: checked === true,
                  })
                }
                className="mt-1"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="counterUpdates"
                  className="text-sm font-medium leading-none text-white cursor-pointer"
                >
                  Counter Updates
                </Label>
                <p className="text-xs text-gray-400">
                  Receive periodic updates about the counter value
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="winner24h"
                checked={preferences.winner24h}
                onCheckedChange={(checked) =>
                  setPreferences({
                    ...preferences,
                    winner24h: checked === true,
                  })
                }
                className="mt-1"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="winner24h"
                  className="text-sm font-medium leading-none text-white cursor-pointer"
                >
                  24-Hour Winner Reminder
                </Label>
                <p className="text-xs text-gray-400">
                  Get notified 24 hours before the weekly winner is announced
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="winner1h"
                checked={preferences.winner1h}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, winner1h: checked === true })
                }
                className="mt-1"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="winner1h"
                  className="text-sm font-medium leading-none text-white cursor-pointer"
                >
                  1-Hour Winner Reminder
                </Label>
                <p className="text-xs text-gray-400">
                  Get notified 1 hour before the weekly winner is announced
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="leaderboardChanges"
                checked={preferences.leaderboardChanges}
                onCheckedChange={(checked) =>
                  setPreferences({
                    ...preferences,
                    leaderboardChanges: checked === true,
                  })
                }
                className="mt-1"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="leaderboardChanges"
                  className="text-sm font-medium leading-none text-white cursor-pointer"
                >
                  Leaderboard Position Changes
                </Label>
                <p className="text-xs text-gray-400">
                  Get notified when you&apos;re overtaken from the #1 spot
                </p>
              </div>
            </div>
          </div>

          {message && (
            <div
              className={`p-3 rounded-md text-sm ${
                message.type === "success"
                  ? "bg-green-900/60 text-green-200"
                  : "bg-red-900/60 text-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-purple-700 hover:bg-purple-600"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Processing...
              </span>
            ) : (
              "Save Preferences"
            )}
          </Button>

          <div className="text-xs text-gray-500 mt-4">
            <p>
              You can unsubscribe at any time by clicking the unsubscribe link
              in any email.
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
