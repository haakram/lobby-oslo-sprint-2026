import type { Metadata } from "next";
import { safeNext } from "@/features/auth/access";
import { authConfig } from "@/features/auth/config";
import { LoginForm } from "@/features/auth/LoginForm";
import { Card, VantaBackdrop } from "@/ui";

export const metadata: Metadata = { title: "Logg inn", robots: { index: false, follow: false } };

// A logged-in visitor never gets here: the proxy sends them on to `next` or home.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams;
  return (
    <main className="relative isolate flex flex-1 items-center justify-center overflow-hidden px-4 py-12 md:px-8">
      <VantaBackdrop />
      <div className="relative z-10 w-full max-w-sm">
        <header className="mb-8">
          <h1 className="font-display text-3xl font-medium tracking-[-0.01em]">Lobby</h1>
          <p className="mt-2 text-base text-muted">Hele hotellet, én pult. Logg inn for natten eller dagen.</p>
        </header>
        <Card className="p-6">
          <LoginForm next={safeNext(typeof next === "string" ? next : undefined)} unavailable={!authConfig().ok} />
        </Card>
        <p className="mt-6 text-sm text-muted">Mangler du tilgang? Spør den som drifter Lobby på hotellet.</p>
      </div>
    </main>
  );
}
