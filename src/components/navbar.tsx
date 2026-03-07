import Link from "next/link";

export function Navbar() {
  return (
    <nav className="border-b border-gray-800 bg-gray-950">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold">
          YouGot<span className="text-wanged-red">Wanged</span>
        </Link>
        <div className="flex gap-6 text-sm text-gray-400">
          <Link href="/trades" className="transition hover:text-white">
            Trades
          </Link>
          <Link href="/leaderboard" className="transition hover:text-white">
            Leaderboard
          </Link>
          <Link href="/submit" className="transition hover:text-white">
            Submit
          </Link>
        </div>
      </div>
    </nav>
  );
}
