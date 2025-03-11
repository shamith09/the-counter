"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

// Types for payout data
interface PayoutRecord {
  id: number;
  user_id: string;
  user_email: string;
  paypal_email: string;
  amount: number;
  batch_id: string;
  status: string;
  created_at: string;
}

interface LeaderboardUser {
  id: string;
  username: string;
  email: string | null;
  paypal_email: string | null;
  score: number;
  rank: number;
}

export default function PayoutsPage() {
  const { data: session, status } = useSession();
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<LeaderboardUser | null>(
    null,
  );
  const [payoutAmount, setPayoutAmount] = useState("10.00");
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Check if user is authorized via server-side API
  useEffect(() => {
    if (status === "loading") return;

    if (!session?.user?.email) {
      setIsAuthorized(false);
      setError("You must be logged in to view this page");
      return;
    }

    const checkAdminStatus = async () => {
      try {
        const response = await fetch("/api/auth/check-admin");
        if (response.ok) {
          setIsAuthorized(true);
        } else {
          setIsAuthorized(false);
          setError("You are not authorized to view this page");
        }
      } catch (err) {
        console.error("Error checking admin status:", err);
        setIsAuthorized(false);
        setError("Failed to verify admin status");
      }
    };

    checkAdminStatus();
  }, [status, session?.user?.email]);

  // Fetch payout history and leaderboard data
  useEffect(() => {
    if (status === "loading" || !isAuthorized) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch payout history
        const [payoutsResponse, leaderboardResponse] = await Promise.all([
          fetch(`/api/payouts/history`),
          fetch(`/api/admin/leaderboard`),
        ]);

        if (!payoutsResponse.ok || !leaderboardResponse.ok) {
          throw new Error("Failed to fetch data");
        }

        const payoutsData = await payoutsResponse.json();
        const leaderboardData = await leaderboardResponse.json();

        setPayouts(payoutsData.payouts || []);
        setLeaderboard(leaderboardData.users || []);
      } catch (err) {
        setError("Failed to load data. Please try again.");
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [status, isAuthorized, session?.user?.email]);

  // Handle manual payout
  const handlePayout = async () => {
    if (!selectedUser) {
      setError("Please select a user");
      return;
    }

    const amount = parseFloat(payoutAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setPayoutLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/paypal/process-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          userEmail: selectedUser.email || selectedUser.username,
          paypalEmail: selectedUser.paypal_email,
          amount: amount.toFixed(2),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to process payout");
      }

      const result = await response.json();

      setSuccess(
        `Payout of $${amount.toFixed(2)} to ${selectedUser.email || selectedUser.username} processed successfully! Batch ID: ${result.batchId}`,
      );

      // Refresh payout history
      const payoutsResponse = await fetch(`/api/payouts/history`);
      if (payoutsResponse.ok) {
        const payoutsData = await payoutsResponse.json();
        setPayouts(payoutsData.payouts || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process payout");
      console.error("Error processing payout:", err);
    } finally {
      setPayoutLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold mb-4">Unauthorized</h1>
        <p>You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-4">PayPal Payouts Admin</h1>

      {/* Manual Payout Section */}
      <div className="bg-gray-100 p-6 rounded-lg mb-8">
        <h2 className="text-xl font-semibold mb-4">Process Manual Payout</h2>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Select User
            </label>
            <select
              className="w-full p-2 border rounded"
              value={selectedUser?.id || ""}
              onChange={(e) => {
                const userId = e.target.value;
                if (userId) {
                  const user =
                    leaderboard.find((u) => u.id.toString() === userId) || null;
                  setSelectedUser(user);
                } else {
                  setSelectedUser(null);
                }
              }}
            >
              <option value="">-- Select a user --</option>
              {leaderboard.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email || user.username || `User ${user.id}`} (Rank:{" "}
                  {user.rank}, PayPal: {user.paypal_email || "Not set"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Amount (USD)
            </label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <Button
            onClick={handlePayout}
            disabled={payoutLoading || !selectedUser}
            className="bg-green-600 hover:bg-green-500"
          >
            {payoutLoading ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              "Process Payout"
            )}
          </Button>
        </div>
      </div>

      {/* Payout History Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Payout History</h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Table>
            <TableCaption>List of all processed payouts</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>PayPal Email</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Batch ID</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-4">
                    No payouts have been processed yet.
                  </TableCell>
                </TableRow>
              ) : (
                payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="text-white">
                      {format(new Date(payout.created_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="text-white">
                      {payout.user_email}
                    </TableCell>
                    <TableCell className="text-white">
                      {payout.paypal_email}
                    </TableCell>
                    <TableCell className="text-white">
                      $
                      {(() => {
                        try {
                          return typeof payout.amount === "number"
                            ? payout.amount.toFixed(2)
                            : parseFloat(payout.amount).toFixed(2);
                        } catch {
                          return payout.amount || "0.00";
                        }
                      })()}
                    </TableCell>
                    <TableCell className="text-white">
                      <span className="text-xs break-all">
                        {payout.batch_id}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          payout.status === "SUCCESS"
                            ? "bg-green-100 text-green-800"
                            : payout.status === "PENDING"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {payout.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
