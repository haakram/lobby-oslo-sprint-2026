import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { HostBookings } from "./HostBookings";
import { HostMessages } from "./HostMessages";
import { HostOverview } from "./HostOverview";
import { type DemoMode, HostProvider } from "./HostProvider";
import { HostSupplies } from "./HostSupplies";

vi.mock("next/navigation", () => ({ usePathname: () => "/vert" }));

// Sunday 8 November 2026, 12:45 in Oslo: mid-turnover.
const MIDDAY = new Date("2026-11-08T11:45:00Z");
const HOST = { user: { u: "vert", name: "Ingrid Berge", role: "host" as const }, view: "host" as const, effectiveRole: "host" as const, exp: 0 };

function asHost(children: ReactNode, mode?: DemoMode) {
  return (
    <SessionProvider session={HOST}>
      <HostProvider now={MIDDAY} mode={mode}>
        {children}
      </HostProvider>
    </SessionProvider>
  );
}

const bell = () => screen.getByRole("button", { name: /^Varsler/ });

describe("Mine boliger (the host's start page)", () => {
  it("shows the four apartments with their status now, and the month's good numbers first", () => {
    render(asHost(<HostOverview />));
    expect(screen.getByRole("heading", { level: 1, name: "Mine boliger" })).toBeInTheDocument();
    expect(screen.getByText("Søndag 8. november. 2 bytter i dag, og alt er i rute.")).toBeInTheDocument();

    const tiles = within(screen.getByRole("region", { name: /Boligene nå/ }));
    for (const name of ["Grünerløkka-leiligheten", "Loftet på Frogner", "Tøyen-studioet", "Sjøutsikt i Bjørvika"]) {
      expect(tiles.getByRole("heading", { name })).toBeInTheDocument();
    }
    for (const status of ["Ny gjest i dag", "Gjest inne", "Rengjøres", "Klar"]) expect(tiles.getByText(status)).toBeInTheDocument();
    // The worst case, answered on the tile: cleaned before check-in, code sent.
    expect(tiles.getByText("Kode sendt i går 18:00")).toBeInTheDocument();

    const figures = within(screen.getByRole("region", { name: "Måneden i tall" }));
    for (const label of ["Bookinger i november", "Belegg i november", "Inntekt hittil i november", "Snittvurdering", "Timer spart", "Oppgaver gjort for deg"]) {
      expect(figures.getByText(label)).toBeInTheDocument();
    }
    expect(figures.getByText("4,92")).toBeInTheDocument();
    // Good news, no alarms: nothing on the page is in a warning or danger figure.
    expect(screen.queryByText(/Obs:|Kritisk:/)).not.toBeInTheDocument();
  });

  it("walks today's turnovers with who handles each step", () => {
    render(asHost(<HostOverview />));
    const turnovers = within(screen.getByRole("region", { name: "Dagens bytter" }));
    expect(turnovers.getByText("2 av 4 ferdig")).toBeInTheDocument();
    expect(turnovers.getByText("Amira vasker nå, ferdig ca. 13:00.")).toBeInTheDocument();
    expect(turnovers.getByText(/Robot · Robotstøvsugeren/)).toBeInTheDocument();
    expect(turnovers.getAllByText(/Renholder · Amira Haddad/)).toHaveLength(2);
    expect(turnovers.getByText("Loftet på Frogner og Sjøutsikt i Bjørvika har ingen bytter i dag.")).toBeInTheDocument();
  });

  it("keeps what needs the host in the bell, and an action there clears it with a visible result", () => {
    render(asHost(<HostOverview />));
    expect(bell()).toHaveAccessibleName("Varsler: 3 ting trenger deg");
    fireEvent.click(bell());
    const sheet = within(screen.getByRole("dialog", { name: "Varsler" }));
    expect(sheet.getByText("Lav på kaffe i Grünerløkka-leiligheten")).toBeInTheDocument();
    expect(sheet.getByText("Lav beholdning")).toBeInTheDocument();
    expect(sheet.getByText(/Sofia spør om sen utsjekk/)).toBeInTheDocument();
    expect(sheet.getByText("Bekreft: service på vaskemaskinen")).toBeInTheDocument();

    fireEvent.click(sheet.getByRole("button", { name: "Bestill påfyll" }));
    expect(sheet.getByRole("status")).toHaveTextContent("Påfyll bestilt. Amira tar det med ved neste rengjøring.");
    expect(bell()).toHaveAccessibleName("Varsler: 2 ting trenger deg");
  });

  it("renders the loading skeleton on the server, with the figures' labels kept", () => {
    const html = renderToString(
      <SessionProvider session={HOST}>
        <HostProvider>
          <HostOverview />
        </HostProvider>
      </SessionProvider>,
    );
    expect(html).toContain("Henter boligene");
    expect(html).toContain("Timer spart");
    expect(html).not.toContain("Grünerløkka-leiligheten");
  });

  it("says how to fill an empty account, and offers a retry when the day fails to load", () => {
    const { unmount } = render(asHost(<HostOverview />, "empty"));
    expect(screen.getByRole("heading", { name: "Ingen boliger ennå" })).toBeInTheDocument();
    expect(bell()).toBeDisabled();
    unmount();

    render(asHost(<HostOverview />, "error"));
    expect(screen.getByRole("alert")).toHaveTextContent("Fikk ikke hentet boligene");
    fireEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Måneden i tall" })).toBeInTheDocument();
  });
});

describe("Gjestemeldinger", () => {
  it("shows every message in Norwegian with the original a tap away, and the auto-replies sent", () => {
    render(asHost(<HostMessages />));
    expect(screen.getByText("Hei! Vi lander 14:10. Kan vi sette fra oss koffertene tidligere?")).toBeInTheDocument();
    expect(screen.getByText("Hallo! Wir landen um 14:10. Können wir die Koffer schon früher abstellen?")).toHaveAttribute("lang", "de");
    expect(screen.getAllByText("Svart automatisk").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("Kode til nøkkelboksen")).toBeInTheDocument();
  });

  it("puts the one that needs the host on top, answered in one tap, and the bell follows", () => {
    render(asHost(<HostMessages />));
    const inbox = within(screen.getByRole("region", { name: /Innboksen/ }));
    const first = inbox.getAllByRole("listitem")[0];
    expect(first).toHaveTextContent("Sofia Marino");
    expect(first).toHaveTextContent("Fettero foreslår å si ja");
    fireEvent.click(within(first).getByRole("button", { name: "Si ja til 13:00" }));
    expect(within(first).getByRole("status")).toHaveTextContent("Du svarte nå nettopp · sendt på italiensk");
    expect(bell()).toHaveAccessibleName("Varsler: 2 ting trenger deg");
  });
});

describe("Bookinger og inntekt", () => {
  it("shows the month, the next 14 nights per apartment and who arrives", () => {
    render(asHost(<HostBookings />));
    expect(screen.getByText("Booket for november")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Bookinger per bolig de neste 14 nettene" })).toBeInTheDocument();
    const arrivals = within(screen.getByRole("region", { name: /Ankomster/ }));
    expect(arrivals.getAllByRole("listitem")[0]).toHaveTextContent("Lukas Becker");
    expect(arrivals.getAllByRole("listitem")[0]).toHaveTextContent("I dag");
    expect(screen.getByRole("region", { name: "Per bolig i november" })).toHaveTextContent("Loftet på Frogner");
  });
});

describe("Forsyninger og vedlikehold", () => {
  it("orders the top-up from the screen's one action, and the bell follows", () => {
    render(asHost(<HostSupplies />));
    expect(screen.getByText("Lav")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bestill påfyll" }));
    const sheet = within(screen.getByRole("dialog", { name: "Bestill påfyll" }));
    expect(sheet.getByText("Kaffe")).toBeInTheDocument();
    fireEvent.click(sheet.getByRole("button", { name: "Bestill" }));
    expect(sheet.getByRole("status")).toHaveTextContent("Bestilt.");
    expect(bell()).toHaveAccessibleName("Varsler: 2 ting trenger deg");
    expect(screen.queryByText("Lav")).not.toBeInTheDocument();
  });

  it("confirms the planned service in place", () => {
    render(asHost(<HostSupplies />));
    const maintenance = within(screen.getByRole("region", { name: /Vedlikehold/ }));
    fireEvent.click(maintenance.getByRole("button", { name: "Bekreft" }));
    expect(maintenance.getByText("Bekreftet")).toBeInTheDocument();
  });
});
