import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Mail Service</h1>
      <p>
        <Link href="/dashboard">Ir al dashboard</Link>
      </p>
    </main>
  );
}
