import Link from "next/link";
import { buttonClasses } from "./Button";
import { EmptyState } from "./EmptyState";

/** Placeholder for a screen that is not built yet. TODO(phase-2): replaced by each feature. */
export function ComingSoon({
  title,
  description,
  surface = "light",
}: {
  title: string;
  description: string;
  surface?: "light" | "dark";
}) {
  return (
    <main data-surface={surface} className="flex-1 bg-bg px-4 pt-10 pb-12 sm:px-8 lg:px-12 lg:pt-16">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em]">{title}</h1>
      <p className="mt-3 max-w-[48ch] text-lg text-muted">{description}</p>
      <EmptyState
        className="mt-12"
        title="Denne skjermen bygges nå"
        body="Den kommer i neste versjon av appen. Gå til forsiden for å se hva som er klart."
        action={
          <Link href="/" className={buttonClasses("secondary")}>
            Gå til forsiden
          </Link>
        }
      />
    </main>
  );
}
