import Link from 'next/link';
export default function DeletionPage() {
  return (
    <main className="policy-page">
      <Link href="/">← Fantasy Front Office</Link>
      <p className="eyebrow">YOUR DATA, YOUR CONTROL</p>
      <h1>Delete your saved data</h1>
      <ol>
        <li>Sign in to your Fantasy Front Office workspace.</li>
        <li>
          Open <strong>Connections</strong>.
        </li>
        <li>Download your saved-data export if you want to keep a copy.</li>
        <li>
          Choose the delete-data action, type <strong>DELETE</strong>, and
          confirm.
        </li>
      </ol>
      <p>
        This permanently deletes your saved trade ideas, notes, frozen analyses,
        and status history from the active application database. It does not
        delete your ChatGPT account or change the shared fictional demo leagues.
        Individual trades can also be deleted in Trade Center.
      </p>
      <p>
        No Yahoo connection exists in this release, so there are no Yahoo tokens
        to revoke or live Yahoo records to remove. Any future connection will
        include a dedicated disconnect and deletion flow.
      </p>
      <p>
        <Link href="/privacy">Read the privacy notice</Link>
      </p>
    </main>
  );
}
