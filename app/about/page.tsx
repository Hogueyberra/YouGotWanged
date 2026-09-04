import Link from 'next/link';
export default function AboutPage() {
  return (
    <main className="policy-page">
      <Link href="/">← Fantasy Front Office</Link>
      <p className="eyebrow">ABOUT THE PROJECT</p>
      <h1>A clearer view of your next move.</h1>
      <p>
        Fantasy Front Office is a private fantasy-football decision workspace
        for redraft auction and superflex leagues. Its first release helps
        compare legal starting lineups, save trade ideas, and preserve the
        evidence available when a decision was made.
      </p>
      <h2>Current release</h2>
      <p>
        This is a working demonstration using fictional leagues, players,
        projections, and auction prices. It is not connected to Yahoo and must
        not be used as current NFL advice. Trade statuses are a personal
        journal; changing one never sends an offer or modifies a Yahoo roster.
      </p>
      <h2>Yahoo integration</h2>
      <p>
        Future integration is planned for approved, read-only league access.
        Available fields, provider approval, and data-retention permissions must
        be verified before live data is enabled. Yahoo is not a sponsor of this
        application.
      </p>
      <p>
        <Link href="/privacy">Privacy and data handling</Link> ·{' '}
        <Link href="/data-deletion">Delete your data</Link>
      </p>
    </main>
  );
}
