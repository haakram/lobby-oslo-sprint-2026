import type { Metadata } from "next";
import { safeNext } from "@/features/auth/access";
import { authConfig } from "@/features/auth/config";
import { LoginForm } from "@/features/auth/LoginForm";
import { Card } from "@/ui";

export const metadata: Metadata = { title: "Logg inn", robots: { index: false, follow: false } };

// A logged-in visitor never gets here: the proxy sends them on to `next` or home.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12 md:px-8">
      <div className="w-full max-w-sm">
        <header className="mb-8">
          <span aria-hidden="true" className="mb-5 block h-1 w-12 rounded-sm bg-accent" />
          <h1 className="text-3xl font-extrabold tracking-[-0.045em]">Lobby</h1>
          <p className="mt-2 text-base text-muted">Oversikt over hele hotellet, med AI.</p>
        </header>
        <Card className="p-6">
          <LoginForm next={safeNext(typeof next === "string" ? next : undefined)} unavailable={!authConfig().ok} />
        </Card>
        <p className="mt-6 text-sm text-muted">Mangler du tilgang? Spør den som drifter Lobby på hotellet.</p>
      </div>
    </main>
  );
}
