'use client';

export default function WorkspaceError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="policy-page">
      <p className="eyebrow">FANTASY FRONT OFFICE</p>
      <h1>Your workspace is temporarily unavailable.</h1>
      <p>
        No changes were made by this page load. Please try again. If this
        continues, return to your build task with the time this happened.
      </p>
      <button className="primary-action" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
