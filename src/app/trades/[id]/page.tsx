import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Trade } from "@/types/trade";

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: trade } = await supabase
    .from("trades")
    .select("*")
    .eq("id", id)
    .single();

  if (!trade) notFound();

  const t = trade as Trade;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-3xl font-bold">{t.title}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {new Date(t.created_at).toLocaleDateString()}
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-800 p-4">
          <h2 className="mb-2 font-semibold text-wanged-green">
            {t.team_a_name}
          </h2>
          <p className="text-gray-300">{t.team_a_players}</p>
        </div>
        <div className="rounded-lg border border-gray-800 p-4">
          <h2 className="mb-2 font-semibold text-wanged-red">
            {t.team_b_name}
          </h2>
          <p className="text-gray-300">{t.team_b_players}</p>
        </div>
      </div>

      {t.description && (
        <p className="mt-6 text-gray-400">{t.description}</p>
      )}
    </div>
  );
}
