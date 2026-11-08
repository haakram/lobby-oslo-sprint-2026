import type { Metadata } from "next";
import { NoAccessActions } from "@/features/auth/NoAccessActions";
import { roleLabel } from "@/features/auth/roles";
import { getSession } from "@/features/auth/server";
import { RegenIcon } from "@/ui";
import { APP_NAME } from "@/ui/brand";

export const metadata: Metadata = { title: "Ingen tilgang", robots: { index: false, follow: false } };

// The proxy rewrites a page the role may not open to here, with status 403. Logged-out visitors never
// reach it (they go to /login first).
export default async function NoAccessPage() {
  const session = await getSession();
  let who = "";
  if (session) {
    const role = roleLabel(session.view).toLowerCase();
    if (session.user.role === "admin" && session.view !== "admin") who = `Du ser ${APP_NAME} som ${role}.`;
    else if (session.user.name.toLowerCase() === role) who = `Du er logget inn som ${role}.`;
    else who = `Du er logget inn som ${session.user.name} (${role}).`;
  }

  return (
    <main className="flex flex-1 items-center px-4 py-12 md:px-8 lg:px-12">
      <div className="flex max-w-md flex-col items-start gap-3 border-l-4 border-danger py-1 pl-4">
        <RegenIcon name="lock" className="text-danger" />
        <h1 className="text-2xl font-bold tracking-[-0.03em]">Ingen tilgang</h1>
        <p className="text-base text-muted">
          {who} Denne siden hører til en annen rolle. Gå til forsiden for det du har tilgang til.
        </p>
        <NoAccessActions />
      </div>
    </main>
  );
}
