import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Role } from "@/features/auth/roles";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { APP_NAME, DESCRIPTION, TAGLINE } from "./brand";
import { AvvikMark, Figure, HandoverLink, RoomStatusTag, Stat } from "./index";
import { AVVIK, ROOM_STATUS, roomPaint } from "./roomStatus";

describe("the brand", () => {
  it("trades as Lobby with one line, no dash", () => {
    expect(APP_NAME).toBe("Lobby");
    expect(TAGLINE).toBe("Natten, ærlig overlevert.");
    for (const line of [TAGLINE, DESCRIPTION]) expect(line).not.toMatch(/[—–]|Lobby/);
  });

  it("says what it is without needing a robot: the handover first, the robot one source beside the night staff's notes", () => {
    expect(DESCRIPTION).toMatch(/^Morgenvakten/);
    expect(DESCRIPTION).toContain("nattevaktens notater");
    expect(DESCRIPTION).toContain("eventuelt en robot");
    expect(DESCRIPTION).not.toMatch(/^Roboten/);
  });
});

describe("Figure (Martian Mono separators)", () => {
  it("sets the decimal comma and the thousands space in the text face, and reads the figure out whole", () => {
    const { container } = render(<Figure value={"151\u00a0530"} />);
    expect(container.querySelector(".sr-only")?.textContent).toBe("151\u00a0530");
    const drawn = container.querySelector('[aria-hidden="true"]');
    expect(drawn?.querySelector(".font-sans")?.textContent).toBe("\u00a0");
    render(<Figure value="4,7" />);
    expect(screen.getByText("4,7")).toHaveClass("sr-only");
  });

  it("sets a unit after the figure in the text face", () => {
    const { container } = render(<Figure value="88 %" />);
    expect(container.querySelector('[aria-hidden="true"] > .font-sans')?.textContent).toBe(" %");
    expect(render(<Figure value="–" />).container.innerHTML).toBe("–");
  });

  it("sets words or a sign before the figure in the text face", () => {
    const { container } = render(<Figure value="ca. 13" />);
    expect(container.querySelector(".sr-only")?.textContent).toBe("ca. 13");
    expect(container.querySelector('[aria-hidden="true"] > .font-sans')?.textContent).toBe("ca. ");
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("ca. 13");
  });

  it("leaves a figure with no separator between digits and no lead as it is", () => {
    const { container } = render(<Figure value="71 av 81" />);
    expect(container.innerHTML).toBe("71 av 81");
    expect(render(<Figure value={12} />).container.innerHTML).toBe("12");
  });

  it("is what Stat draws for a plain value", () => {
    const { container } = render(<Stat label="Snittpris" value={"1\u00a0450"} unit="kr" />);
    expect(container.querySelector(".sr-only")?.textContent).toBe("1\u00a0450");
    expect(container.querySelector('[aria-hidden="true"] .font-sans')?.textContent).toBe("\u00a0");
    expect(screen.getByText("Snittpris")).toBeInTheDocument();
  });
});

describe("one room-state language (src/ui/roomStatus.ts)", () => {
  it("draws a state as the rack does: the key tag in the status colour, then the word", () => {
    const { container } = render(<RoomStatusTag status="ma_vaskes" />);
    expect(screen.getByText("Må vaskes")).toHaveClass(ROOM_STATUS.ma_vaskes.ink, "font-semibold");
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass(ROOM_STATUS.ma_vaskes.tag);
    render(<RoomStatusTag status="ukjent" />);
    expect(screen.getByText("Ikke sjekket")).toHaveClass("text-muted");
  });

  it("marks an avvik in ink, never red, with its count", () => {
    render(<AvvikMark count={2} />);
    const mark = screen.getByText("2 åpne avvik");
    expect(mark).toHaveClass(AVVIK.ink, AVVIK.edge);
    expect(mark.className).not.toMatch(/danger/);
    expect(render(<AvvikMark count={0} />).container).toBeEmptyDOMElement();
    expect(JSON.stringify(AVVIK)).not.toMatch(/danger/);
  });

  it("tells plans and the 3D hotel how to paint a room: its status, an ink outline for an avvik", () => {
    expect(roomPaint("klar")).toEqual({ fill: "success", outline: null, word: "Klar" });
    expect(roomPaint("ma_vaskes", true)).toEqual({ fill: "warning", outline: "text", word: "Må vaskes" });
    // The replay knows some rooms only by their avvik: "not checked" with the outline, never a red fill.
    expect(roomPaint("avvik")).toEqual({ fill: "line", outline: "text", word: "Avvik" });
    expect(roomPaint("noe-annet").fill).toBe("line");
  });

  it("gives a state the same badge tone everywhere: only Klar and Må vaskes carry colour", () => {
    expect(Object.fromEntries(Object.entries(ROOM_STATUS).map(([key, look]) => [key, look.badge]))).toEqual({
      klar: "success",
      ma_vaskes: "warning",
      opptatt: "neutral",
      ikke_forstyrr: "neutral",
      ukjent: "neutral",
    });
  });
});

function as(role: Role) {
  return { user: { u: role, name: "Test", role }, view: role, effectiveRole: role, exp: 0 };
}

describe("HandoverLink (Oversikt to Overlevering 06:00)", () => {
  it("links the roles that may open the handover to it", () => {
    for (const role of ["admin", "receptionist"] as const) {
      const { unmount } = render(
        <SessionProvider session={as(role)}>
          <HandoverLink />
        </SessionProvider>,
      );
      expect(screen.getByRole("link", { name: "Se overleveringen" })).toHaveAttribute("href", "/overlevering");
      unmount();
    }
  });

  it("shows nothing to a role that can't open it, or to nobody", () => {
    const { container } = render(
      <SessionProvider session={as("robot")}>
        <HandoverLink />
      </SessionProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(render(<HandoverLink />).container).toBeEmptyDOMElement();
  });
});
