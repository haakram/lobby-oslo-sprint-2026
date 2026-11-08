import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nightCalls } from "@/features/reception/nightCalls";
import { ReceptionPanelView } from "./ReceptionPanel";

const retry = () => {};

describe("Oversikt's Resepsjon widget counts the night's calls as Overlevering does (round 5, owner E's nightCalls)", () => {
  it("shows last night's sample calls under one Eksempel line, never 'Ingen samtaler ennå' while there are samples", () => {
    const samples = nightCalls([]).samples.length;
    expect(samples).toBeGreaterThan(0);
    render(<ReceptionPanelView state={{ kind: "ready", calls: [] }} retry={retry} />);
    expect(screen.queryByText("Ingen samtaler ennå")).not.toBeInTheDocument();
    expect(screen.getByText(`Eksempel: ${samples} samtaler fra i natt (testdata)`)).toBeInTheDocument();
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
