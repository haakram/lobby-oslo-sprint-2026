import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { joinNo, RobotJudgementCard } from "./RobotJudgementCard";
import { parseRunLog } from "./runlog";

const DEMO = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;

describe("RobotJudgementCard on the demo night", () => {
  it("leads with the stranger, as one incident with its times, in Norwegian", () => {
    render(<RobotJudgementCard lines={DEMO} />);
    const card = screen.getByRole("region", { name: "Robotens vurderinger i natt" });
    expect(within(card).getByText("Sikkerhet · én hendelse")).toBeInTheDocument();
    expect(card).toHaveTextContent("Sa nei 7 ganger til en ukjent person");
    expect(card).toHaveTextContent("ba roboten slippe ham inn i 7 ulike rom mellom 01:17 og 05:11");
    expect(card).toHaveTextContent("ga ikke fra seg nøkkelkort og fulgte ikke etter");
    expect(card).toHaveTextContent("To ganger ventet den med å låse opp rom 209 og rom 304 til han var borte");
    expect(card).toHaveTextContent("Roboten svarte (engelsk): I'm sorry, I can't open rooms for guests. Please ask the front desk to check your ID.");
    const times = within(card).getByRole("list", { name: "Når og hvor" });
    expect(within(times).getAllByRole("listitem")).toHaveLength(7);
    expect(within(times).getAllByRole("listitem")[0]).toHaveTextContent("01:17 · rom 308");
  });

  it("shows every done as confirmed, the declined claims, the signs and the doors", () => {
    render(<RobotJudgementCard lines={DEMO} />);
    const card = screen.getByRole("region", { name: "Robotens vurderinger i natt" });
    expect(card).toHaveTextContent("73 av 73«Ferdig» bekreftet av Wybe-serveren");
    expect(card).toHaveTextContent("8Meldinger avvist etter sjekk");
    expect(card).toHaveTextContent("6 klager på bestillinger som ikke fantes, 1 levering som alt var gjort og 1 søl uten noe nytt å gjøre");
    expect(card).toHaveTextContent("4Skilt for vått gulv satt ut");
    expect(card).toHaveTextContent("Korridor 3d, 3a, 2a og 3c.Vått uten skilt ved slutten: korridor 1c, 2b og 3d.");
    expect(card).toHaveTextContent("Ingen dører hadde Ikke forstyrr-skilt i natt.");
    // The person's English plea is not shown; only the robot's own reply, as a quote.
    expect(card).not.toHaveTextContent(/bathrobe|locked out/i);
  });

  it("says how far into the night it counts while the replay runs", () => {
    render(<RobotJudgementCard lines={DEMO} until={4 * 3600} asOf="02:00:00" />);
    const card = screen.getByRole("region", { name: "Robotens vurderinger i natt" });
    expect(card).toHaveTextContent("Fra robotens logg, fram til 02:00");
    expect(card).toHaveTextContent("Sa nei 3 ganger");
  });

  it("leaves the incident out when nobody asked, and says nothing is done yet on an empty log", () => {
    render(<RobotJudgementCard lines={[]} />);
    const card = screen.getByRole("region", { name: "Robotens vurderinger i natt" });
    expect(within(card).queryByText("Sikkerhet · én hendelse")).not.toBeInTheDocument();
    expect(card).toHaveTextContent("Roboten har ikke meldt noe ferdig ennå.");
  });
});

describe("joinNo", () => {
  it("joins like Norwegian", () => {
    expect(joinNo([])).toBe("");
    expect(joinNo(["a"])).toBe("a");
    expect(joinNo(["a", "b", "c"])).toBe("a, b og c");
  });
});
