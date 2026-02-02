import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-[var(--text)] mb-4">State Not Found</h1>
        <p className="text-[var(--muted)] mb-8">
          The state you're looking for doesn't exist in our directory.
        </p>
        <Link
          href="/"
          className="inline-block bg-gradient-to-r from-[var(--accent1)] to-[var(--accent2)] text-white px-6 py-3 rounded-lg hover:opacity-90 transition-opacity"
        >
          Return to Homepage
        </Link>
      </div>
    </div>
  );
}
