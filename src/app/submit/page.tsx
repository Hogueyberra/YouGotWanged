"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SubmitTradePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const supabase = createClient();

    const { error } = await supabase.from("trades").insert({
      title: form.get("title") as string,
      team_a_name: form.get("team_a_name") as string,
      team_a_players: form.get("team_a_players") as string,
      team_b_name: form.get("team_b_name") as string,
      team_b_players: form.get("team_b_players") as string,
      description: form.get("description") as string,
    });

    if (error) {
      alert("Failed to submit trade. Please try again.");
      setSubmitting(false);
      return;
    }

    router.push("/trades");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-3xl font-bold">Submit a Trade</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          name="title"
          placeholder="Trade title (e.g. 'The Heist')"
          required
          className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-wanged-red focus:outline-none"
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <input
              name="team_a_name"
              placeholder="Team A name"
              required
              className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-wanged-green focus:outline-none"
            />
            <textarea
              name="team_a_players"
              placeholder="Team A gets..."
              required
              rows={3}
              className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-wanged-green focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-2">
            <input
              name="team_b_name"
              placeholder="Team B name"
              required
              className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-wanged-red focus:outline-none"
            />
            <textarea
              name="team_b_players"
              placeholder="Team B gets..."
              required
              rows={3}
              className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-wanged-red focus:outline-none"
            />
          </div>
        </div>

        <textarea
          name="description"
          placeholder="Context or hot take (optional)"
          rows={3}
          className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-gray-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-wanged-red px-6 py-3 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Trade"}
        </button>
      </form>
    </div>
  );
}
