import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { crossNightPrecision, grouped, percentText, shiftOf } from "./ledger";
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
    expect(card).toHaveTextContent("73 av 73«Ferdig» godkjent av dommeren");
    expect(card).toHaveTextContent("Dommeren, Wybe Night Shift-simulatoren, godkjente hver ferdigmelding i natt.");
    expect(card).not.toHaveTextContent("Wybe-serveren");
    expect(card).toHaveTextContent("7 av 8Avvisninger godkjent av dommeren");
    expect(card).toHaveTextContent("7 falske klager avvist (godkjent av dommeren) · 1 ikke godkjent.");
    expect(card).toHaveTextContent("Ikke godkjent: R-036 (roboten fant ikke noe nytt søl).");
    expect(card).toHaveTextContent("Seks gjester sa at noe aldri kom. Roboten fant ingen bestilling og leverte ikke. Gi det likevel? Det avgjør resepsjonen i Forespørsler.");
    expect(within(card).getByRole("link", { name: "Forespørsler" })).toHaveAttribute("href", "/foresporsler?filter=robot");
    // No virtue badge: the refusals are a decision for a person, not proof the robot did well.
    expect(card).not.toHaveTextContent("gjorde ikke noe unødvendig");
    expect(card).toHaveTextContent("4Skilt for vått gulv satt ut");
    expect(card).toHaveTextContent("Korridor 3d, 3a, 2a og 3c.Vått uten skilt ved slutten: korridor 1c, 2b og 3d.");
    expect(card).toHaveTextContent("Ingen dører hadde Ikke forstyrr-skilt i natt.");
    // The person's English plea is not shown; only the robot's own reply, as a quote.
    expect(card).not.toHaveTextContent(/bathrobe|locked out/i);
  });

  it("puts the night's 73 of 73 beside every live night in the ledger and the demo build's own nights, computed", () => {
    render(<RobotJudgementCard lines={DEMO} />);
    const card = screen.getByRole("region", { name: "Robotens vurderinger i natt" });
    const { all, build } = crossNightPrecision(shiftOf(DEMO));
    expect(all!.credited).toBeLessThan(all!.reported);
    expect(card).toHaveTextContent(
      // The card groups thousands with a no-break space; the matcher reads it as a plain one.
      `Alle ${all!.nights} live-netter med logg: ${grouped(all!.credited)} av ${grouped(all!.reported)} godkjent (${percentText(all!.percent)}).`.replace(/\u00a0/g, " "),
    );
    expect(build).toMatchObject({ commit: "cb72845", nights: 4, credited: 290, reported: 291 });
    expect(card).toHaveTextContent("Samme versjon som i natt (cb72845): 290 av 291 over 4 netter.");
    expect(card).toHaveTextContent("Kilde: docs/runs/ledger.csv.");
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
