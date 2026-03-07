import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center gap-8 pt-16 text-center">
      <h1 className="text-5xl font-bold tracking-tight">
        You Got <span className="text-wanged-red">Wanged</span>
      </h1>
      <p className="max-w-lg text-lg text-gray-400">
        Submit your fantasy trades. Let the community decide who came out on
        top — and who got absolutely wanged.
      </p>
      <div className="flex gap-4">
        <Link
          href="/trades"
          className="rounded-lg bg-wanged-red px-6 py-3 font-semibold text-white transition hover:bg-red-700"
        >
          Browse Trades
        </Link>
        <Link
          href="/submit"
          className="rounded-lg border border-gray-700 px-6 py-3 font-semibold text-gray-300 transition hover:border-gray-500 hover:text-white"
        >
          Submit a Trade
        </Link>
      </div>
    </div>
  );
}
