import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Alert } from "./alerts";
import { bellLabel, NotificationBellView } from "./NotificationBell";
import { SEEN_PREFIX } from "./useSeen";

// The bell in the navigation: a count of what is new to this person, a sheet with one action per
// alert, Marker som sett / Merk alle som sett kept per user in this browser.
function alert(id: string, title: string, overrides: Partial<Alert> = {}): Alert {
  return { id, level: 1, module: "foresporsler", priority: "obs", icon: "inbox", title, detail: null, action: { label: "Åpne Forespørsler", href: "/foresporsler" }, ...overrides };
}

const ALERTS: Alert[] = [
  alert("handover", "Roboten ga 3 forespørsler videre", { level: 3, priority: "hoy", detail: "Gjester i rom 101 og 323 venter på en person." }),
  alert("out-of-order", "Rom 107 er stengt i dag", { module: "vedlikehold", icon: "key", action: { label: "Åpne Vedlikehold", href: "/vedlikehold" } }),
  alert("stock", "Badehåndklær er under minimum", { module: "lager", icon: "archive", action: { label: "Åpne Lager", href: "/lager" } }),
];

function bell() {
  return screen.getByRole("button", { name: /^Varsler/ });
}

function openBell() {
  fireEvent.click(bell());
  return within(screen.getByRole("dialog", { name: "Varsler" }));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("NotificationBellView", () => {
  it("says the count in its name and shows it on the badge", () => {
    render(<NotificationBellView alerts={ALERTS} loading={false} user="hamad" />);
    expect(bell()).toHaveAccessibleName("Varsler, 3 nye");
    expect(bell()).toHaveAttribute("aria-haspopup", "dialog");
    expect(bell()).toHaveTextContent("3");
    expect([bellLabel(1, false), bellLabel(0, false), bellLabel(0, true)]).toEqual(["Varsler, 1 ny", "Varsler, ingen nye", "Varsler, henter"]);
  });

  it("lists what needs a person, Haster said in words, each with its one way in", () => {
    render(<NotificationBellView alerts={ALERTS} loading={false} user="hamad" />);
    const sheet = openBell();
    const rows = within(sheet.getByRole("list", { name: "Nye varsler" })).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual(ALERTS.map((entry) => entry.title));
    expect(within(rows[0]).getByText("Haster")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Gjester i rom 101 og 323 venter på en person.")).toBeInTheDocument();
    expect(within(rows[1]).getByRole("link", { name: "Åpne Vedlikehold" })).toHaveAttribute("href", "/vedlikehold");
    expect(within(rows[2]).getByRole("button", { name: "Marker som sett: Badehåndklær er under minimum" })).toBeInTheDocument();
  });

  it("marks one alert as seen: it moves under Sett, the count drops, and it stays seen after a reload", () => {
    const first = render(<NotificationBellView alerts={ALERTS} loading={false} user="hamad" />);
    const sheet = openBell();
    fireEvent.click(sheet.getByRole("button", { name: "Marker som sett: Rom 107 er stengt i dag" }));

    expect(sheet.getByRole("status")).toHaveTextContent("Rom 107 er stengt i dag: markert som sett.");
    expect(within(sheet.getByRole("list", { name: "Nye varsler" })).getAllByRole("listitem")).toHaveLength(2);
    expect(within(sheet.getByRole("region", { name: "Sett" })).getByText("Rom 107 er stengt i dag")).toBeInTheDocument();
    // The focus goes on to the next new alert, not to the page behind the sheet.
    expect(sheet.getByRole("button", { name: "Marker som sett: Badehåndklær er under minimum" })).toHaveFocus();
    expect(bell()).toHaveAccessibleName("Varsler, 2 nye");
    expect(JSON.parse(localStorage.getItem(`${SEEN_PREFIX}hamad`) ?? "{}")).toEqual({ "out-of-order": 1 });

    first.unmount();
    render(<NotificationBellView alerts={ALERTS} loading={false} user="hamad" />);
    expect(bell()).toHaveAccessibleName("Varsler, 2 nye");
  });

  it("marks all as seen at once, and keeps them listed quietly with their action", () => {
    render(<NotificationBellView alerts={ALERTS} loading={false} user="hamad" />);
    const sheet = openBell();
    fireEvent.click(sheet.getByRole("button", { name: "Merk alle som sett" }));

    expect(bell()).toHaveAccessibleName("Varsler, ingen nye");
    expect(bell()).not.toHaveTextContent(/\d/);
    expect(sheet.getByText("Alt her er sett.")).toBeInTheDocument();
    expect(sheet.queryByRole("button", { name: "Merk alle som sett" })).not.toBeInTheDocument();
    const seen = within(sheet.getByRole("region", { name: "Sett" }));
    expect(seen.getAllByRole("listitem")).toHaveLength(3);
    expect(seen.getByRole("link", { name: "Åpne Lager" })).toHaveAttribute("href", "/lager");
    // Only new alerts are red or amber.
    expect(seen.queryByText("Haster")).not.toHaveClass("text-danger");
  });

  it("brings a seen alert back when there is more of it, and keeps each person's seen apart", () => {
    localStorage.setItem(`${SEEN_PREFIX}hamad`, JSON.stringify({ handover: 3, "out-of-order": 1, stock: 1 }));
    const more = ALERTS.map((entry) => (entry.id === "handover" ? { ...entry, level: 4, title: "Roboten ga 4 forespørsler videre" } : entry));
    const first = render(<NotificationBellView alerts={more} loading={false} user="hamad" />);
    expect(bell()).toHaveAccessibleName("Varsler, 1 ny");
    first.unmount();
    // Fewer than were seen stays seen.
    const fewer = ALERTS.map((entry) => (entry.id === "handover" ? { ...entry, level: 2 } : entry));
    const second = render(<NotificationBellView alerts={fewer} loading={false} user="hamad" />);
    expect(bell()).toHaveAccessibleName("Varsler, ingen nye");
    second.unmount();
    render(<NotificationBellView alerts={ALERTS} loading={false} user="resepsjon" />);
    expect(bell()).toHaveAccessibleName("Varsler, 3 nye");
  });

  it("says so calmly when nothing needs anyone", () => {
    render(<NotificationBellView alerts={[]} loading={false} user="hamad" />);
    expect(bell()).toHaveAccessibleName("Varsler, ingen nye");
    const sheet = openBell();
    expect(sheet.getByRole("heading", { name: "Ingenting trenger deg nå" })).toBeInTheDocument();
    expect(sheet.queryByRole("button", { name: "Merk alle som sett" })).not.toBeInTheDocument();
  });

  it("shows placeholders while the hotel loads, and says when the night failed", () => {
    const first = render(<NotificationBellView alerts={[]} loading user="hamad" />);
    expect(bell()).toHaveAccessibleName("Varsler, henter");
    expect(openBell().getByText("Henter varslene")).toBeInTheDocument();
    first.unmount();
    render(<NotificationBellView alerts={ALERTS.slice(1)} loading={false} nightFailed user="hamad" />);
    expect(openBell().getByText(/Natten er ikke lastet, så robotens varsler mangler her/)).toBeInTheDocument();
  });

  it("lists five and names the rest, so nothing is dropped without a word; the badge counts all six", () => {
    const many = Array.from({ length: 6 }, (_, index) => alert(`a${index}`, `Varsel ${index + 1}`));
    render(<NotificationBellView alerts={many} loading={false} user="hamad" />);
    // Every new alert counts, also the one named in "og 1 til" (review round 1: the badge said 5 with 6 in the sheet).
    expect(bell()).toHaveAccessibleName("Varsler, 6 nye");
    const sheet = openBell();
    expect(sheet.getByText("6 nye, trenger en person")).toBeInTheDocument();
    expect(within(sheet.getByRole("list", { name: "Nye varsler" })).getAllByRole("listitem")).toHaveLength(5);
    expect(sheet.getByText("og 1 til:")).toBeInTheDocument();
    expect(sheet.getByRole("link", { name: "Varsel 6" })).toHaveAttribute("href", "/foresporsler");
    // Merk alle som sett means all six.
    fireEvent.click(sheet.getByRole("button", { name: "Merk alle som sett" }));
    expect(bell()).toHaveAccessibleName("Varsler, ingen nye");
  });

  it("still marks as seen for this tab when the browser refuses storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<NotificationBellView alerts={ALERTS} loading={false} user="blokkert" />);
    const sheet = openBell();
    fireEvent.click(sheet.getByRole("button", { name: "Merk alle som sett" }));
    expect(bell()).toHaveAccessibleName("Varsler, ingen nye");
  });
});
