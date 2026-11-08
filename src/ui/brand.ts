/**
 * The product's name and its one line (review round 1: one name, one line). "Lobby" was the working
 * name until a review found a funded hotel-AI company by that name on the same PMS channel, so the
 * product trades as Fettero. "Hotell Nattskift" is only the demo hotel. Code identifiers keep their
 * old names (`lobby:` storage keys, `LOBBY_USERS`); only what people read changes.
 */
export const APP_NAME = "Fettero";

/** The one line: on the login page, in the page metadata, in the README and on the first slide. */
export const TAGLINE = "Natten, ærlig overlevert.";

/**
 * What it is, in one sentence after the tagline (login lede, meta description, link previews, the app
 * manifest). It sells without a robot (round 3, marketing review: the hotel called on Monday owns none): the
 * handover is the product, and the robot is one source beside the night staff's own notes. "kl. 06:00"
 * never breaks across lines.
 */
export const DESCRIPTION =
  "Morgenvakten på hotellet får natten på én side kl.\u00a006:00: rom som kan selges, det som er åpent med eier og frist, og hva som faktisk ble gjort, fra nattevaktens notater og eventuelt en robot.";
