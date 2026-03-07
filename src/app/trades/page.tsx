import { createClient } from "@/lib/supabase/server";
import { TradeCard } from "@/components/trade-card";
import type { Trade } from "@/types/trade";

export const revalidate = 60;

export default async function TradesPage() {
  const supabase = await createClient();

  const { data: trades } = await supabase
    .from("trades")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Recent Trades</h1>
      {trades && trades.length > 0 ? (
        <div className="flex flex-col gap-4">
          {(trades as Trade[]).map((trade) => (
            <TradeCard key={trade.id} trade={trade} />
          ))}
        </div>
      ) : (
        <p className="text-gray-500">
          No trades yet. Be the first to submit one.
        </p>
      )}
    </div>
  );
}
