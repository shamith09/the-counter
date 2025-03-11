"use client";

import { useEffect, useState, createContext, useContext } from "react";
import Marquee from "react-fast-marquee";

interface Ad {
  id: string;
  content: string;
  created_at: string;
  expires_at: string;
}

// Create a context to expose the refresh function
type MarqueeAdsContextType = {
  refreshAds: () => Promise<void>;
  refreshTrigger: number;
};

const MarqueeAdsContext = createContext<MarqueeAdsContextType | null>(null);

// Export a hook to use the refresh function
export function useMarqueeAds() {
  const context = useContext(MarqueeAdsContext);
  if (!context) {
    throw new Error("useMarqueeAds must be used within a MarqueeAdsProvider");
  }
  return context;
}

export function MarqueeAdsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshAds = async () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <MarqueeAdsContext.Provider value={{ refreshAds, refreshTrigger }}>
      {children}
    </MarqueeAdsContext.Provider>
  );
}

export function MarqueeAds() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const context = useContext(MarqueeAdsContext);

  useEffect(() => {
    const fetchAds = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/ads");

        if (!response.ok) {
          throw new Error("Failed to fetch ads");
        }

        const data = await response.json();
        setAds(data.ads || []);
      } catch (err) {
        console.error("Error fetching ads:", err);
        setError("Failed to load advertisements");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAds();

    // Refresh ads every minute
    const intervalId = setInterval(fetchAds, 60000);

    return () => clearInterval(intervalId);
  }, [context?.refreshTrigger]);

  // If no ads, show a placeholder or nothing
  if (ads.length === 0 && !isLoading) {
    return (
      <div className="w-full py-2 text-white overflow-hidden">
        <div className="flex items-center justify-center">
          <p className="text-sm">
            <button
              onClick={() => {
                const adPurchaseButton = document.querySelector(
                  "#ad-purchase",
                ) as HTMLButtonElement;
                if (adPurchaseButton) adPurchaseButton.click();
              }}
              className="text-purple-300 hover:underline bg-transparent border-none cursor-pointer p-0"
            >
              Purchase ad space here
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-2 text-white overflow-hidden">
      {isLoading ? (
        <div className="flex items-center justify-center">
          <p className="text-sm text-gray-400">Loading advertisements...</p>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : (
        <Marquee
          speed={30}
          gradient={false}
          pauseOnHover
          className="overflow-hidden"
        >
          {[...Array(100)].flatMap((_, i) =>
            ads.map((ad) => (
              <span key={`${ad.id}-${i}`} className="inline-flex items-center">
                <span className="text-purple-300">{ad.content}</span>
                <span className="mx-4 text-purple-400">•</span>
              </span>
            )),
          )}
        </Marquee>
      )}
    </div>
  );
}
