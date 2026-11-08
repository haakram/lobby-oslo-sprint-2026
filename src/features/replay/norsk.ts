import { itemName, placeInSentence, roomNumber } from "./hotel";

/**
 * The robot's own notes in the hotel's words (jury round 1: English agent strings inside a bokmål UI).
 * The agent writes short templated English notes ("tray-205 x1 delivered to room-205", "No pillow
 * order from 308 on record tonight"); these become plain Norwegian. A note no rule knows is returned
 * as it was, so nothing is lost. Guests' and the robot's spoken words stay quotes in their language.
 */

type Rule = [RegExp, (...groups: string[]) => string];

const capitalise = (text: string) => (text ? text.charAt(0).toLocaleUpperCase("nb-NO") + text.slice(1) : text);
const place = (id: string) => placeInSentence(id);
const room = (id: string) => `rom ${roomNumber(id.startsWith("room-") ? id : `room-${id}`)}`;
const item = (id: string) => itemName(id.replace(/_/g, "-"));
/** The kind of thing, without its number: the room is already in the sentence ("Brett levert til rom 205"). */
const BASE_ITEMS: Record<string, string> = { tray: "brett", luggage: "bagasje" };
const thing = (id: string) => {
  const base = id.replace(/(?:-\d+)+$/, "");
  return BASE_ITEMS[base] ?? itemName(base);
};
const count = (n: string) => (Number(n) > 1 ? `${n} × ` : "");

const MESSAGES: Record<string, string> = {
  "their car is parked in bay four": "bilen står på plass fire",
  "the spa opens at eight": "spaet åpner klokken åtte",
  "breakfast starts at seven": "frokosten starter klokken sju",
  "the taxi is here": "taxien er her",
};

const LOOKS: Rule[] = [
  [/^Nobody is here\. The room is tidy\.?$/i, () => "Ingen der. Rommet er ryddig."],
  [/^Nobody is here\. The bed is unmade and there are towels on the floor\.?$/i, () => "Ingen der. Sengen er ikke redd, og det ligger håndklær på gulvet."],
  [/^Nobody is here\.?(.*)$/i, (rest) => `Ingen der.${rest ? ` ${rest.trim()}` : ""}`],
  [/^(.+?) opens the door of (room-\d+)\.?$/i, (who) => `${who} åpnet døren.`],
  [/^No answer\.?$/i, () => "Ingen svarte."],
  [/^No door to (room-\d+) here\.?$/i, (id) => `Ingen dør til ${room(id)} her.`],
];

const NOTES: Rule[] = [
  [/^([\w-]+) x(\d+) delivered to (room-\d+)$/i, (what, n, id) => `${capitalise(`${count(n)}${thing(what)}`)} levert til ${room(id)}`],
  [/^([\w-]+) taken up to (room-\d+)$/i, (_what, id) => `Bagasje båret opp til ${room(id)}`],
  [/^placed ([\w-]+) inside (room-\d+).*$/i, (what, id) => `${capitalise(thing(what))} satt inn i ${room(id)}`],
  [/^asked (room-\d+) to keep the noise down$/i, (id) => `Ba ${room(id)} dempe støyen`],
  [/^looked inside (room-\d+): (.*)$/i, (id, look) => `Så inn i ${room(id)}: ${lookText(look)}`],
  [/^wet-floor sign placed over the wet patch at ([\w-]+)$/i, (at) => `Skilt for vått gulv satt ut i ${place(at)}`],
  [/^wet-floor sign moved from ([\w-]+) to the wet patch at ([\w-]+)$/i, (from, to) => `Skilt for vått gulv flyttet fra ${place(from)} til ${place(to)}`],
  [/^told (room-\d+): (.*)$/i, (id, message) => `Ga beskjed til ${room(id)}: ${MESSAGES[message.trim().toLowerCase()] ?? `«${message.trim()}»`}`],
  [/^No ([\w-]+) order from (\d+) on record tonight; nothing was ordered\.?$/i, (what, n) => `Ingen bestilling av ${item(what)} fra ${room(n)} i natt; ingenting å levere`],
  [/^The ([\w-]+) for (\d+) was already delivered under (R-\d+); nothing more to bring\.?$/i, (what, n, request) => `${capitalise(item(what))} til ${room(n)} er alt levert (${request}); ingenting mer å levere`],
  [/^No new wet patch on floor (\d).*?(and no wet-floor sign in stock)?\.?$/i, (floor, noSign) => `Ingen nye våte gulv i ${floor}. etasje, bare de som alt var meldt${noSign ? ", og ingen skilt på lager" : ""}`],
  [/^no order for ([\w-]+) from (\d+) on record$/i, (what, n) => `Ingen bestilling av ${item(what)} fra ${room(n)} i natt; ingenting å levere`],
  [/^Do Not Disturb sign on (room-\d+); did not disturb$/i, (id) => `Ikke forstyrr-skilt på ${room(id)}; banket ikke på`],
  [/^([\w-]+) not found after (\d+) scans$/i, (what, n) => `Fant ikke ${item(what)} etter ${n} søk`],
  [/^could not pick ([\w-]+): .*$/i, (what) => `Fant ikke ${item(what)} der den skulle være`],
  [/^([\w-]+) out of stock$/i, (what) => `Tomt for ${item(what)}`],
  [/^.* but the score did not rise$/i, () => "Levert, men ikke bekreftet"],
  [/^did not knock: Do Not Disturb.*$/i, () => "Banket ikke på: Ikke forstyrr"],
  [/^Do Not Disturb on (room-\d+)\.?$/i, (id) => `Ikke forstyrr på ${room(id)}`],
];

function apply(rules: Rule[], text: string): string | null {
  const trimmed = text.trim();
  for (const [pattern, render] of rules) {
    const match = pattern.exec(trimmed);
    if (match) return render(...match.slice(1).map((group) => group ?? ""));
  }
  return null;
}

/** What the robot saw behind a door, in Norwegian; unknown descriptions stay as they were. */
export function lookText(text: string): string {
  return apply(LOOKS, text) ?? text;
}

/** A task note from the agent in Norwegian; unknown notes stay as they were. */
export function agentNote(text: string): string {
  if (!text) return text;
  return apply(NOTES, text) ?? apply(LOOKS, text) ?? text;
}
