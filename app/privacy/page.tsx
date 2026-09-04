import Link from 'next/link';
export default function PrivacyPage() {
  return (
    <main className="policy-page">
      <Link href="/">← Fantasy Front Office</Link>
      <p className="eyebrow">UPDATED SEPTEMBER 4, 2026</p>
      <h1>Privacy & data handling</h1>
      <p>
        This notice describes this private demonstration release, not a future
        live Yahoo service.
      </p>
      <h2>What is stored</h2>
      <p>
        The application uses your authenticated account identifier to keep saved
        trade ideas, notes, decision-time analyses, and status history separate
        from other users. Your display name may be shown in the interface.
        Shared demonstration leagues are fictional. Avoid entering sensitive
        personal information in notes.
      </p>
      <h2>Where it is stored</h2>
      <p>
        The demonstration is hosted through OpenAI Sites with Cloudflare Workers
        and D1 storage. The platform manages sign-in and hosting infrastructure.
        Application data is not sent to Yahoo, xAI, X, news publishers, or an AI
        model by this release. Platform access logs may be retained under the
        hosting provider’s policies.
      </p>
      <h2>Retention and control</h2>
      <p>
        Saved trade data remains until you delete it. You can download a JSON
        export or permanently delete your saved trades and status history from
        Connections. Deletion removes application records from the active
        database; infrastructure backups and platform logs follow the hosting
        provider’s retention policies.
      </p>
      <h2>Future live providers</h2>
      <p>
        Yahoo access is not enabled. Before enabling it, this notice will be
        updated to describe approved permissions, token storage, revocation,
        retention, and any external processing. No assumption is made that Yahoo
        player projections, article bodies, or long-lived history may be
        collected or retained.
      </p>
      <p>
        <Link href="/data-deletion">Data deletion instructions</Link>
      </p>
    </main>
  );
}
