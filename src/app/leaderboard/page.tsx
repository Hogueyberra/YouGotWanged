import { createClient } from "@/lib/supabase/server";

export const revalidate = 60;

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const { data: trades } = await supabase
    .from("trades")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">
        Wanged <span className="text-wanged-gold">Leaderboard</span>
      </h1>
      <p className="mb-4 text-gray-500">
        The most lopsided trades in your league. Voting coming soon.
      </p>
      {trades && trades.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full text-left">
            <thead className="border-b border-gray-800 bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-sm font-medium text-gray-400">
                  #
                </th>
                <th className="px-4 py-3 text-sm font-medium text-gray-400">
                  Trade
                </th>
                <th className="px-4 py-3 text-sm font-medium text-gray-400">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, i) => (
                <tr key={trade.id} className="border-b border-gray-800/50">
                  <td className="px-4 py-3 text-wanged-gold">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{trade.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(trade.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500">No trades to rank yet.</p>
      )}
    </div>
  );
}
