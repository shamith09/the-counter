"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import dynamic from "next/dynamic";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis } from "recharts";
import { useSession } from "next-auth/react";
import { PayPalSetupDialog } from "@/components/paypal-setup-dialog";
import { Clock, Trophy, DollarSign } from "lucide-react";

// Import map components dynamically with ssr disabled
const MapComponent = dynamic(
  () => import("./map-component"), // We'll create this component next
  { ssr: false },
);

interface UserStats {
  user_id: string;
  username: string;
  increment_count: number;
  last_increment: string;
}

interface CountryStats {
  country_code: string;
  country_name: string;
  increment_count: number;
  last_increment: string;
}

type TimeRange = "hour" | "day" | "week" | "month" | "year" | "all";

interface CounterHistory {
  count: number;
  timestamp: string;
  start_count?: number;
  end_count?: number;
  avg_count?: number;
  min_count?: number;
  max_count?: number;
}

interface LastWinner {
  username: string;
  amount: number;
  payoutDate: string;
}

interface NextPayout {
  timestamp: string;
  timeLeft: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
}

interface PayoutInfo {
  lastWinner: LastWinner;
  nextPayout: NextPayout;
}

const chartConfig = {
  counter: {
    label: "Counter Value",
    color: "hsl(267, 84%, 71%)",
  },
  rate: {
    label: "Rate of Change",
    color: "hsl(267, 84%, 71%)",
  },
  dayDistribution: {
    label: "Day Distribution",
    color: "hsl(267, 84%, 71%)",
  },
  hourDistribution: {
    label: "Hour Distribution",
    color: "hsl(267, 84%, 71%)",
  },
} satisfies ChartConfig;

// Update the date formatting functions
const formatDate = (
  timestamp: string | null | undefined,
  formatStr: string,
) => {
  if (!timestamp) {
    return "N/A";
  }
  return formatInTimeZone(
    new Date(timestamp),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    formatStr,
  );
};

const formatTooltipDate = (timestamp: string | null | undefined) => {
  if (!timestamp) {
    return "N/A";
  }
  return formatInTimeZone(
    new Date(timestamp),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    "MM/dd/yyyy hh:mm a zzz",
  );
};

export default function StatsPage() {
  const [leaderboard, setLeaderboard] = useState<UserStats[]>([]);
  const [countryStats, setCountryStats] = useState<CountryStats[]>([]);
  const [history, setHistory] = useState<CounterHistory[]>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>("all");
  const [showPayPalSetup, setShowPayPalSetup] = useState(false);
  const [hasPayPalSetup, setHasPayPalSetup] = useState(false);
  const [payoutInfo, setPayoutInfo] = useState<PayoutInfo | null>(null);
  const [countdown, setCountdown] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const { data: session } = useSession();
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timeRangeLabels: Record<TimeRange, string> = {
    hour: "Last Hour",
    day: "Last 24 Hours",
    week: "Last 7 Days",
    month: "Last 30 Days",
    year: "Last Year",
    all: "All Time",
  };

  const getStatistics = (data: CounterHistory[]) => {
    if (data.length === 0) return null;

    // The history data is ordered with newest first, so we need to reverse for calculations
    const reversedData = [...data].reverse();

    const oldestCount = reversedData[0].count;
    const latestCount = reversedData[reversedData.length - 1].count;
    const totalChange = latestCount - oldestCount;

    const timeSpanHours =
      (new Date(reversedData[reversedData.length - 1].timestamp).getTime() -
        new Date(reversedData[0].timestamp).getTime()) /
      (1000 * 60 * 60);

    // Avoid division by zero for very small time spans
    const averagePerHour = timeSpanHours > 0 ? totalChange / timeSpanHours : 0;

    return {
      start: oldestCount.toLocaleString(),
      end: latestCount.toLocaleString(),
      change: totalChange.toLocaleString(),
      averagePerHour: Math.round(averagePerHour).toLocaleString(),
    };
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch all data with the same time range
        const [leaderboardRes, countryRes, historyRes, payoutInfoRes] =
          await Promise.all([
            fetch(`/api/stats/leaderboard?range=${selectedTimeRange}`),
            fetch(`/api/stats/country?range=${selectedTimeRange}`),
            fetch(`/api/counter/history?range=${selectedTimeRange}`),
            fetch(`/api/last-winner-and-next-payout`),
          ]);

        const [leaderboardData, countryData, historyData, payoutInfoData] =
          await Promise.all([
            leaderboardRes.json(),
            countryRes.json(),
            historyRes.json(),
            payoutInfoRes.json(),
          ]);

        setLeaderboard(leaderboardData || []);
        setCountryStats(countryData || []);
        setHistory(historyData || []);
        setPayoutInfo(payoutInfoData || null);

        if (payoutInfoData) {
          setCountdown({
            days: payoutInfoData.nextPayout.timeLeft.days,
            hours: payoutInfoData.nextPayout.timeLeft.hours,
            minutes: payoutInfoData.nextPayout.timeLeft.minutes,
            seconds: payoutInfoData.nextPayout.timeLeft.seconds,
          });
        }
      } catch (error) {
        console.error("Error fetching stats:", error);
        setError("Failed to load stats data. Please try again later.");
      } finally {
        // Only set initialLoading to false after the first load
        setInitialLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [selectedTimeRange]);

  // Update countdown timer every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        // Handle case when all values are zero or negative
        if (
          prev.days <= 0 &&
          prev.hours <= 0 &&
          prev.minutes <= 0 &&
          prev.seconds <= 0
        ) {
          // Refresh data to get new countdown
          const fetchData = async () => {
            try {
              const payoutInfoRes = await fetch(
                `/api/last-winner-and-next-payout`,
              );
              const payoutInfoData = await payoutInfoRes.json();

              if (payoutInfoData) {
                setPayoutInfo(payoutInfoData);
                setCountdown({
                  days: payoutInfoData.nextPayout.timeLeft.days,
                  hours: payoutInfoData.nextPayout.timeLeft.hours,
                  minutes: payoutInfoData.nextPayout.timeLeft.minutes,
                  seconds: payoutInfoData.nextPayout.timeLeft.seconds,
                });
              }
            } catch (error) {
              console.error("Error refreshing countdown data:", error);
            }
          };

          fetchData();
          return { days: 0, hours: 0, minutes: 0, seconds: 0 };
        }

        const newSeconds = prev.seconds - 1;

        if (newSeconds >= 0) {
          return { ...prev, seconds: newSeconds };
        }

        const newMinutes = prev.minutes - 1;
        if (newMinutes >= 0) {
          return { ...prev, minutes: newMinutes, seconds: 59 };
        }

        const newHours = prev.hours - 1;
        if (newHours >= 0) {
          return { ...prev, hours: newHours, minutes: 59, seconds: 59 };
        }

        const newDays = prev.days - 1;
        if (newDays >= 0) {
          return { days: newDays, hours: 23, minutes: 59, seconds: 59 };
        }

        // If we reach here, the countdown is complete, return zeros
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const rateOfChangeData =
    history.length > 1
      ? [...history]
          .reverse()
          .slice(1)
          .map((entry, index) => {
            const prevEntry = history[history.length - 1 - index];
            const countDiff = entry.count - prevEntry.count;

            return {
              timestamp: entry.timestamp,
              rate: countDiff,
              unit:
                selectedTimeRange === "year" || selectedTimeRange === "month"
                  ? "day"
                  : selectedTimeRange === "week"
                    ? "hour"
                    : "minute",
            };
          })
      : [];

  const mapPoints = useMemo(() => {
    return countryStats.map((stat) => ({
      country_code: stat.country_code,
      count: stat.increment_count,
      name: stat.country_name,
    }));
  }, [countryStats]);

  // Prepare history data for the charts in chronological order (oldest to newest)
  const chartData = useMemo(() => [...history].reverse(), [history]);

  const distributionData = useMemo(() => {
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const dayDistribution = new Array(7).fill(0);
    const hourDistribution = new Array(24).fill(0);

    history.forEach((entry) => {
      const date = new Date(entry.timestamp);
      const day = date.getDay();
      const hour = date.getHours();

      dayDistribution[day]++;
      hourDistribution[hour]++;
    });

    const maxDay = Math.max(...dayDistribution);
    const maxHour = Math.max(...hourDistribution);

    return {
      dayData: dayNames.map((name, index) => ({
        name: name.slice(0, 3),
        value: (dayDistribution[index] / maxDay) * 100,
      })),
      hourData: Array.from({ length: 24 }, (_, i) => ({
        name: i.toString().padStart(2, "0"),
        value: (hourDistribution[i] / maxHour) * 100,
      })),
    };
  }, [history]);

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
          setShowPayPalSetup(!paypal_email);
        } catch (error) {
          console.error("Error checking PayPal setup:", error);
        }
      }
    };

    checkPayPalSetup();
  }, [session]);

  if (initialLoading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-purple-300">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          {error && <div className="text-red-500 mt-4">{error}</div>}
        </div>
      </main>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-4 bg-black min-h-screen text-purple-50 mt-8">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/"
          className="flex items-center gap-2 text-purple-300 hover:text-purple-200"
        >
          <ArrowLeft className="h-6 w-6" />
          Back
        </Link>
        <h1 className="text-4xl font-bold text-purple-300">
          Counter Statistics
        </h1>
        {session?.user ? (
          !hasPayPalSetup && (
            <div className="text-yellow-400 text-sm ml-auto">
              ⚠️ Set up PayPal to appear on leaderboard
            </div>
          )
        ) : (
          <div className="text-yellow-400 text-sm ml-auto">
            ⚠️ Sign in to appear on leaderboard
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-purple-500/20 bg-black/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-purple-300 flex items-center">
              <Clock className="mr-2 h-5 w-5" /> Next Winner Countdown
            </CardTitle>
            <CardDescription className="text-purple-200/70">
              Top user on the weekly leaderboard gets $10 every Monday at 12:00
              AM UTC
            </CardDescription>
          </CardHeader>
          <CardContent>
            {countdown.days <= 0 &&
            countdown.hours <= 0 &&
            countdown.minutes <= 0 &&
            countdown.seconds <= 0 ? (
              <div className="text-center p-4">
                <div className="text-xl font-bold text-green-400 mb-2">
                  Payout in progress!
                </div>
                <div className="text-sm text-purple-300">
                  The weekly winner is being determined right now.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-purple-900/30 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-purple-100">
                    {Math.max(0, countdown.days)}
                  </div>
                  <div className="text-xs text-purple-300">DAYS</div>
                </div>
                <div className="bg-purple-900/30 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-purple-100">
                    {Math.max(0, countdown.hours)}
                  </div>
                  <div className="text-xs text-purple-300">HOURS</div>
                </div>
                <div className="bg-purple-900/30 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-purple-100">
                    {Math.max(0, countdown.minutes)}
                  </div>
                  <div className="text-xs text-purple-300">MINUTES</div>
                </div>
                <div className="bg-purple-900/30 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-purple-100">
                    {Math.max(0, countdown.seconds)}
                  </div>
                  <div className="text-xs text-purple-300">SECONDS</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-purple-500/20 bg-black/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-purple-300 flex items-center">
              <Trophy className="mr-2 h-5 w-5" /> Last Week&apos;s Winner
            </CardTitle>
            <CardDescription className="text-purple-200/70">
              Congratulations!
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payoutInfo?.lastWinner?.username ? (
              <div className="flex flex-col items-center justify-center p-4">
                <div className="flex items-center mb-2">
                  <Trophy className="h-8 w-8 text-yellow-400 mr-2" />
                  <span className="text-xl font-bold text-purple-100">
                    {payoutInfo.lastWinner.username}
                  </span>
                </div>
                <div className="flex items-center text-green-400">
                  <DollarSign className="h-5 w-5 mr-1" />
                  <span className="font-semibold">
                    ${payoutInfo.lastWinner.amount.toFixed(2)}
                  </span>
                </div>
                <div className="text-sm text-purple-300 mt-2">
                  Paid on{" "}
                  {formatDate(payoutInfo.lastWinner.payoutDate, "MM/dd/yyyy")}
                </div>
              </div>
            ) : (
              <div className="text-center p-4 text-purple-300">
                No previous winners yet. Be the first!
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs
        defaultValue={selectedTimeRange}
        onValueChange={(value) => setSelectedTimeRange(value as TimeRange)}
        className="w-full mb-8"
      >
        <TabsList className="bg-purple-950/50 inline-flex h-auto flex-wrap gap-2 p-2">
          {Object.entries(timeRangeLabels).map(([range, label]) => (
            <TabsTrigger
              key={range}
              value={range}
              className="data-[state=active]:bg-purple-500 data-[state=active]:text-white px-4 py-2"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="border-purple-500/20 bg-black/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-purple-300">Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-purple-500/20">
                <TableHead className="text-purple-300">Rank</TableHead>
                <TableHead className="text-purple-300">Name</TableHead>
                <TableHead className="text-purple-300">
                  Total Value Added
                </TableHead>
                <TableHead className="text-purple-300">Last Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((user, index) => (
                <TableRow key={user.user_id} className="border-purple-500/20">
                  <TableCell className="text-purple-200">{index + 1}</TableCell>
                  <TableCell className="text-purple-200">
                    {user.username}
                  </TableCell>
                  <TableCell className="text-purple-200">
                    {user.increment_count}
                  </TableCell>
                  <TableCell className="text-purple-200">
                    {formatDate(user.last_increment, "MM/dd/yyyy hh:mm a")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-purple-500/20 bg-black/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-purple-300">Global Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px] w-full">
              <MapComponent points={mapPoints} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-500/20 bg-black/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-purple-300">Country Rankings</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-purple-500/20">
                  <TableHead className="text-purple-300">Rank</TableHead>
                  <TableHead className="text-purple-300">Country</TableHead>
                  <TableHead className="text-purple-300">
                    Total Value Added
                  </TableHead>
                  <TableHead className="text-purple-300">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {countryStats.map((country, index) => (
                  <TableRow
                    key={country.country_code}
                    className="border-purple-500/20"
                  >
                    <TableCell className="text-purple-200">
                      {index + 1}
                    </TableCell>
                    <TableCell className="text-purple-200">
                      {country.country_name}
                    </TableCell>
                    <TableCell className="text-purple-200">
                      {country.increment_count}
                    </TableCell>
                    <TableCell className="text-purple-200">
                      {formatDate(country.last_increment, "MM/dd/yyyy hh:mm a")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-purple-500/20 bg-black/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-purple-300">Counter Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Statistics Display */}
            {getStatistics(history) && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <Card className="border-purple-500/20 bg-black/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-sm text-purple-300 mb-2">
                        Starting Value
                      </div>
                      <div className="text-2xl font-bold text-purple-100">
                        {getStatistics(history)?.start}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-purple-500/20 bg-black/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-sm text-purple-300 mb-2">
                        Current Value
                      </div>
                      <div className="text-2xl font-bold text-purple-100">
                        {getStatistics(history)?.end}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-purple-500/20 bg-black/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-sm text-purple-300 mb-2">
                        Total Change
                      </div>
                      <div className="text-2xl font-bold text-purple-100">
                        {getStatistics(history)?.change}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-purple-500/20 bg-black/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-sm text-purple-300 mb-2">
                        Average Per Hour
                      </div>
                      <div className="text-2xl font-bold text-purple-100">
                        {getStatistics(history)?.averagePerHour}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              <div className="h-[300px] mb-4">
                <div className="text-sm text-purple-300 mb-2">
                  Value Over Time
                </div>
                <ChartContainer
                  config={chartConfig}
                  className="aspect-auto h-[300px] w-full"
                >
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient
                        id="fillCounter"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-counter)"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-counter)"
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      stroke="hsl(var(--border) / 0.1)"
                    />
                    <XAxis
                      dataKey="timestamp"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={32}
                      tickFormatter={(timestamp) =>
                        formatDate(
                          timestamp,
                          selectedTimeRange === "hour"
                            ? "hh:mm a"
                            : "MM/dd hh:mm a",
                        )
                      }
                    />
                    <YAxis
                      domain={[0, "auto"]}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(timestamp) =>
                            formatTooltipDate(timestamp)
                          }
                          indicator="dot"
                        />
                      }
                    />
                    <Area
                      dataKey="count"
                      type="monotone"
                      fill="url(#fillCounter)"
                      stroke="var(--color-counter)"
                      baseValue={0}
                    />
                  </AreaChart>
                </ChartContainer>
              </div>

              <div className="h-[300px]">
                <div className="text-sm text-purple-300 mb-2">
                  Counter Change (
                  {selectedTimeRange === "year" || selectedTimeRange === "month"
                    ? "increments per day"
                    : selectedTimeRange === "week"
                      ? "increments per hour"
                      : "increments per minute"}
                  )
                </div>
                <ChartContainer
                  config={chartConfig}
                  className="aspect-auto h-[300px] w-full"
                >
                  <AreaChart data={rateOfChangeData}>
                    <defs>
                      <linearGradient id="fillRate" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="var(--color-rate)"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-rate)"
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      stroke="hsl(var(--border) / 0.1)"
                    />
                    <XAxis
                      dataKey="timestamp"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={32}
                      tickFormatter={(timestamp) =>
                        formatDate(
                          timestamp,
                          selectedTimeRange === "hour"
                            ? "hh:mm a"
                            : "MM/dd hh:mm a",
                        )
                      }
                    />
                    <YAxis
                      domain={[0, "auto"]}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value.toLocaleString()}`}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(timestamp) =>
                            formatTooltipDate(timestamp)
                          }
                          formatter={(value) => [
                            Number(value).toLocaleString(),
                          ]}
                          indicator="dot"
                        />
                      }
                    />
                    <Area
                      dataKey="rate"
                      type="monotone"
                      fill="url(#fillRate)"
                      stroke="var(--color-rate)"
                      baseValue={0}
                    />
                  </AreaChart>
                </ChartContainer>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-purple-500/20 bg-black/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-purple-300">
              Increments by day of week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={chartConfig}
              className="aspect-square h-[300px] w-full"
            >
              <RadarChart
                data={distributionData.dayData}
                cx="50%"
                cy="50%"
                outerRadius="80%"
              >
                <PolarGrid stroke="hsl(var(--border) / 0.2)" />
                <PolarAngleAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground) / 0.8)" }}
                />
                <Radar
                  name="Activity"
                  dataKey="value"
                  stroke="var(--color-dayDistribution)"
                  fill="var(--color-dayDistribution)"
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-purple-500/20 bg-black/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-purple-300">
              Increments by hour of day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={chartConfig}
              className="aspect-square h-[300px] w-full"
            >
              <RadarChart
                data={distributionData.hourData}
                cx="50%"
                cy="50%"
                outerRadius="80%"
              >
                <PolarGrid stroke="hsl(var(--border) / 0.2)" />
                <PolarAngleAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground) / 0.8)" }}
                />
                <Radar
                  name="Activity"
                  dataKey="value"
                  stroke="var(--color-hourDistribution)"
                  fill="var(--color-hourDistribution)"
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <PayPalSetupDialog
        open={showPayPalSetup}
        onOpenChange={setShowPayPalSetup}
      />
    </div>
  );
}
