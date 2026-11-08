import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nightCalls } from "@/features/requests/nightCalls";
import { ReceptionPanelView } from "./ReceptionPanel";

const retry = () => {};

describe("Oversikt's Resepsjon widget counts the night's calls as Overlevering does (round 5, owner E's nightCalls)", () => {
  it("says 'Ingen samtaler ennå' as Resepsjon's call log does, with last night's samples under one Eksempel line", () => {
    const samples = nightCalls([]).samples.length;
    expect(samples).toBeGreaterThan(0);
    render(<ReceptionPanelView state={{ kind: "ready", calls: [] }} retry={retry} />);
    expect(screen.getByText("Ingen samtaler ennå")).toBeInTheDocument();
    expect(screen.getByText(`Eksempel: ${samples} samtaler fra i natt (testdata, ikke i samtaleloggen)`)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(samples);
  });

  it("lists a live call first and keeps the samples when the receptionist is not set up", () => {
    const live = { id: "c-1", startedAt: "2026-11-08T05:40:00+01:00", title: "Booking", summary: null, callerName: "Kari", requestType: null, arrival: null, departure: null, guests: null, needsCallback: false };
    const { unmount } = render(<ReceptionPanelView state={{ kind: "ready", calls: [live] }} retry={retry} />);
    expect(screen.getByRole("list", { name: "Siste samtaler" })).toHaveTextContent("Kari");
    unmount();
    render(<ReceptionPanelView state={{ kind: "not-set-up" }} retry={retry} />);
    expect(screen.getByText("Resepsjonisten er ikke koblet til ennå")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Eksempelsamtaler fra i natt" })).toBeInTheDocument();
  });
});
