import NavigationMap from '@/components/NavigationMap';

// /?code=FC02SIMBP87 opens straight onto that building (used after signing in to claim it).
// /?code=…&gate=<claim id> opens it to mark or move that claim's gate (from My places).
export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string; gate?: string }> }) {
  const { code, gate } = await searchParams;
  return (
    <main className="h-dvh w-full">
      <NavigationMap
        initialCode={typeof code === 'string' ? code : undefined}
        editGateFor={typeof gate === 'string' ? gate : undefined}
      />
    </main>
  );
}
