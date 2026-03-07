import Link from "next/link";
import type { Trade } from "@/types/trade";

export function TradeCard({ trade }: { trade: Trade }) {
  return (
    <Link
      href={`/trades/${trade.id}`}
      className="block rounded-lg border border-gray-800 p-4 transition hover:border-gray-600"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{trade.title}</h2>
        <span className="text-xs text-gray-500">
          {new Date(trade.created_at).toLocaleDateString()}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="font-medium text-wanged-green">
            {trade.team_a_name}
          </span>
          <p className="text-gray-400">{trade.team_a_players}</p>
        </div>
        <div>
          <span className="font-medium text-wanged-red">
            {trade.team_b_name}
          </span>
          <p className="text-gray-400">{trade.team_b_players}</p>
        </div>
      </div>
    </Link>
  );
}
