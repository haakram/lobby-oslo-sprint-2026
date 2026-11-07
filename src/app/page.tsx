import Link from "next/link";
import { Card, EyeIcon, MicIcon, MoonIcon, RouteIcon } from "@/ui";

// Each card wears the surface of the screen it opens: camera and night shift are dark.
const ENTRIES = [
  {
    href: "/oyne",
    title: "Øyne",
    body: "Pek kameraet på en vare. Fettero kjenner den igjen uten strekkode.",
    surface: "dark",
    Icon: EyeIcon,
  },
  {
    href: "/ruter",
    title: "Ruter",
    body: "Korteste vei til alle varene på plukklisten, på tvers av etasjer.",
    surface: "light",
    Icon: RouteIcon,
  },
  {
    href: "/stemme",
    title: "Stemme",
    body: "Spør på ditt eget språk. Fettero svarer høyt og viser veien.",
    surface: "light",
    Icon: MicIcon,
  },
  {
    href: "/natteskift",
    title: "Natteskift",
    body: "Se hva roboten gjorde i natt: oppgaver, klokke og poeng.",
    surface: "dark",
    Icon: MoonIcon,
  },
] as const;

export default function Home() {
  return (
    <main className="flex-1 px-4 pt-10 pb-12 sm:px-8 lg:px-12 lg:pt-16">
      <header>
        <h1 className="text-3xl font-extrabold tracking-[-0.045em] sm:text-display">Fettero</h1>
        <div aria-hidden="true" className="mt-5 h-1 w-16 bg-accent" />
        <p className="mt-6 max-w-[36ch] text-lg text-muted sm:text-xl">
          Robotkollegaen som kjenner igjen varen, finner korteste vei og snakker ditt språk.
        </p>
      </header>
      <ul className="mt-10 grid max-w-5xl gap-3 sm:grid-cols-2 lg:mt-14 lg:gap-4">
        {ENTRIES.map(({ href, title, body, surface, Icon }, index) => (
          <li key={href} className="animate-rise" style={{ animationDelay: `${index * 60}ms` }}>
            <Link href={href} className="group block h-full rounded-lg">
              <Card
                data-surface={surface}
                className="flex h-full min-h-44 flex-col justify-between gap-8 transition-colors duration-200 ease-standard group-hover:border-line-strong sm:min-h-56 sm:p-6"
              >
                <Icon className="size-8" />
                <div>
                  <h2 className="text-2xl font-bold tracking-[-0.02em]">{title}</h2>
                  <p className="mt-2 text-base text-muted">{body}</p>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
