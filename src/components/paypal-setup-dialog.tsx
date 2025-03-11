import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PayPalSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [paypalEmail, setPaypalEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate email format
      if (!paypalEmail.includes("@") || !paypalEmail.includes(".")) {
        throw new Error("Please enter a valid email address");
      }

      // Save the PayPal email
      const response = await fetch("/api/paypal/save-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paypalEmail,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save PayPal email");
      }

      // Success - close dialog and refresh page
      onOpenChange(false);
      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up payout information</DialogTitle>
          <DialogDescription>
            To receive weekly payouts when you top the leaderboard, please
            provide your PayPal email address. This ensures we can send your
            winnings securely.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="paypal-email" className="text-sm font-medium">
              PayPal Email Address
            </label>
            <Input
              id="paypal-email"
              type="email"
              placeholder="your-email@example.com"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
              required
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !paypalEmail}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              "Save PayPal Information"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
