import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="policy-page">
      <h1>That page isn’t in the playbook.</h1>
      <p>
        <Link href="/">Return to your front office</Link>
      </p>
    </main>
  );
}
