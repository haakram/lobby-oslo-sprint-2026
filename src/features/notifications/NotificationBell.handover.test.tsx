import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/features/auth/roles";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { HandoverScreen } from "@/features/handover/HandoverScreen";
import { osloToday } from "@/features/reception/dates";
import { NotificationBell } from "./NotificationBell";

// The bell and Overlevering read one composition (handover/useHandover.ts): the bell's Haster safety
// alerts are Åpent nå's straks saker, the night clerk's own entries included (her 02:15 lobby floor was
// missing from the bell: 9 there against the page's count), and its line says the page's two numbers.
const DEMO = readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8");
const fetchMock = vi.fn<typeof fetch>();

function as(role: Role) {
  const session = { user: { u: "siri", name: "Siri Haugen", role }, view: role, effectiveRole: role, exp: 0 };
  return render(
    <SessionProvider session={session}>
      {role === "robot" ? null : <HandoverScreen today={osloToday()} />}
      <NotificationBell />
    </SessionProvider>,
  );
}

async function openBell() {
  const bell = screen.getByRole("button", { name: /^Varsler/ });
  await waitFor(() => expect(bell).not.toHaveAccessibleName("Varsler, henter"));
  fireEvent.click(bell);
  return within(screen.getByRole("dialog", { name: "Varsler" }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/runs/demo.jsonl") return new Response(DEMO, { status: 200 });
    if (url === "/api/reception/calls") return Response.json({ error: "ikke satt opp" }, { status: 503 });
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("the bell agrees with Overlevering's Åpent nå", () => {
  it("says the page's total and straks, and lists exactly those straks saker as Haster, the night clerk's lobby floor among them", async () => {
    as("admin");
    const open = await screen.findByRole("region", { name: /^Åpent nå/ });
    const total = Number(open.querySelector("h2 span")?.textContent);
    const straks = Number(within(open).getByText(/^\d+ straks · \d+ med frist i dag$/).textContent?.split(" ")[0]);
    expect([total, straks]).toEqual([13, 5]);

    const sheet = await openBell();
    const line = sheet.getByText(`Overlevering 06:00: ${straks} straks av ${total} åpne`);
    expect(within(line.parentElement!).getByRole("link", { name: "Åpne Overlevering" })).toHaveAttribute("href", "/overlevering");
    const rows = [...document.querySelectorAll<HTMLElement>("[data-alert]")];
    const safety = rows.filter((row) => /^(wet-floor|stranger|staff-)/.test(row.dataset.alert ?? ""));
    expect(safety).toHaveLength(straks);
    for (const row of safety) expect(within(row).getByText("Haster")).toBeInTheDocument();
    // Her floor, as the page has it: reported at 02:15, a sign out a minute later; still a sak until mopped.
    expect(sheet.getByText("Vått gulv i lobbyen, skilt satt ut")).toBeInTheDocument();
    expect(sheet.getByText("Siden 02:15. Meldt av Kjersti Lund, skilt satt ut 02:16. Vaktmester, straks.")).toBeInTheDocument();
    expect(within(open).getByText(/^Lobbyen · meldt 02:15 av Kjersti Lund · skilt satt ut 02:16$/)).toBeInTheDocument();
  });

  it("follows the page's switch: without a robot it counts the page built from the clerk, the door lock and the booking system", async () => {
    window.history.replaceState(null, "", "/overlevering?kilde=uten-robot");
    try {
      as("admin");
      const open = await screen.findByRole("region", { name: /^Åpent nå/ });
      await waitFor(() => expect(open.querySelector("h2 span")).not.toBeNull());
      const total = Number(open.querySelector("h2 span")?.textContent);
      const sheet = await openBell();
      const line = sheet.getByText(/^Overlevering 06:00: \d+ straks av \d+ åpne?$/);
      expect(line.textContent).toMatch(new RegExp(` av ${total} åpne?$`));
      // Her lobby floor is the one wet floor; the robot's floors are not on this page, so not in its count.
      const safety = [...document.querySelectorAll<HTMLElement>("[data-alert]")].filter((row) => /^(wet-floor|stranger|staff-)/.test(row.dataset.alert ?? ""));
      expect(safety.map((row) => row.dataset.alert)).toEqual(["wet-floor:lobby"]);
      expect(line.textContent).toMatch(/: 1 straks av/);
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("leaves the line out for a role that can't open Overlevering", async () => {
    as("robot");
    const sheet = await openBell();
    expect(sheet.queryByText(/^Overlevering 06:00:/)).not.toBeInTheDocument();
  });
});
