import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-neutral-600">The page you&rsquo;re looking for doesn&rsquo;t exist.</p>
      <Link href="/" className="text-blue-600 underline">
        Back home
      </Link>
    </main>
  );
}
