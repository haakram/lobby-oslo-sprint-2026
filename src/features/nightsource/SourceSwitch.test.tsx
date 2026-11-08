import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceSwitch } from "./SourceSwitch";
import { sourceFromSearch, useNightSource } from "./useNightSource";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("SourceSwitch (Med robot | Uten robot)", () => {
  it("is a pair of pressed buttons, Med robot by default, and says nothing more while the robot night shows", () => {
    const onChange = vi.fn();
    render(<SourceSwitch value="robot" onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Natten fra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Med robot" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Uten robot" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText(/Uten robot:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Uten robot" }));
    expect(onChange).toHaveBeenCalledWith("none");
  });

  it("says what the robot-free page rests on, and what of it is test data", () => {
    const sources = { staffEntries: 4, samples: 4, clerk: "Kjersti Lund", doorLockRooms: 36, doorLockFlags: 2 };
    const { rerender } = render(<SourceSwitch value="none" onChange={() => {}} sources={sources} />);
    expect(screen.getByText(/^Uten robot:/)).toHaveTextContent(
      "Uten robot: bookingsystemet, dørlåsen (ett signal per rom, aldri kort-id, aldri klokkeslett) og 4 registreringer fra nattevakten (eksempler). Bookingene og dørlåsen er testdata.",
    );
    rerender(<SourceSwitch value="none" onChange={() => {}} sources={{ ...sources, staffEntries: 5, samples: 4 }} />);
    expect(screen.getByText(/^Uten robot:/)).toHaveTextContent("5 registreringer fra nattevakten (4 av dem eksempler)");
    rerender(<SourceSwitch value="none" onChange={() => {}} sources={{ ...sources, staffEntries: 1, samples: 0 }} />);
    expect(screen.getByText(/^Uten robot:/)).toHaveTextContent("og 1 registrering fra nattevakten. Bookingene");
  });
});

function Probe() {
  const [source, choose] = useNightSource();
  return (
    <>
      <output>{source}</output>
      <button type="button" onClick={() => choose(source === "robot" ? "none" : "robot")}>
        bytt
      </button>
    </>
  );
}

describe("useNightSource", () => {
  it("reads ?kilde=uten-robot, and keeps the choice in the address (other parameters kept)", () => {
    expect(sourceFromSearch("?kilde=uten-robot")).toBe("none");
    expect(sourceFromSearch("?kilde=robot")).toBe("robot");
    expect(sourceFromSearch("")).toBe("robot");

    window.history.replaceState(null, "", "/overlevering?x=1#apent");
    render(<Probe />);
    expect(screen.getByRole("status")).toHaveTextContent("robot");
    act(() => fireEvent.click(screen.getByRole("button", { name: "bytt" })));
    expect(screen.getByRole("status")).toHaveTextContent("none");
    expect(window.location.search).toBe("?x=1&kilde=uten-robot");
    expect(window.location.hash).toBe("#apent");
    act(() => fireEvent.click(screen.getByRole("button", { name: "bytt" })));
    expect(window.location.search).toBe("?x=1");
  });

  it("opens on the robot-free night from a link", () => {
    window.history.replaceState(null, "", "/overlevering?kilde=uten-robot");
    render(<Probe />);
    expect(screen.getByRole("status")).toHaveTextContent("none");
  });
});
