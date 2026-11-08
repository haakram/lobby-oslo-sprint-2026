# HOLIO.md — Holio pains 3, 6 and 9 in Fettero, with the honest status

> For Holio (the people at the stand) and for us. Written Sun 8 Nov, updated
> at about 03:10, at 05:50 (owner E's round-5 fixes: guides that name only real controls) and at 07:00
> (owner E's round-6 fixes: the guide language is kept) from the code on `hamad/jury-loop`. The Øyne parts
> were re-read at about 09:45 against the camera that ships (ShirazIQ's, as on `main`), which has no picker
> between candidate products and no avvik. Fettero is a hotel product; this page says plainly which parts
> of it work for a web-shop warehouse today, which parts are hotel stand-ins, and what we would build
> first. The brief: `docs/CONTEXT.md` § 6 and *Hackathon - Holio og utfordringer fra lagerdriften.pdf*.

## In one paragraph

We built one chain that matters to a warehouse: **an item with no barcode → its SKU → the pick list
→ the shortest pick route**, plus work guides on screen in the worker's language. Each link runs in
the app, but on stand-ins: a 12-SKU test catalogue and a 4-shelf test warehouse map. There is no
warehouse mode, no measured accuracy, no use of order history and no test on a Zebra yet. If Holio
says "one pain, deep", we lead with **pain 3** (the only one with real AI and a full flow) and call 6
and 9 what it plugs into.

## The three pains, screen by screen

| Pain | Where in Fettero | What works today | Honest status |
|---|---|---|---|
| **3. Recognise a product without a barcode** | **Robotens øyne** (`/oyne`, `src/features/eyes/`) | The phone's camera draws boxes on the device (MediaPipe EfficientDet-Lite0), and live recognition (on by default) sends the crop of each stable box that isn't a person through our server to Claude; a tap does the same for one box. Claude reads the text on the pack and picks the SKU from the catalogue, with what it read and a confidence label (*Sikker / Ganske sikker / Usikker, sjekk varen*). The card shows the SKU, *Vis vei* and *Legg i plukkliste* at any confidence (`src/features/eyes/ProductCard.tsx`), so on *Usikker* the worker checks the item before adding it; this build has no picker between the products it could be and no avvik for a wrong match. A `/ruter?sku=` link only shows the way to that shelf, with the name and the shelf, never the SKU, and never adds to the pick list (`src/features/routes/PicklistMode.tsx`). *Identifiser hele bildet* sends the whole frame when no box appears. | **Works with network and a key; not measured.** The catalogue is 12 test SKUs in the prompt (`src/features/catalog/products.ts`), which does not scale. The on-device detector knows COCO classes (bottle, cup …), with no class for a carton, polybag or envelope, so most warehouse goods need a tap. The confidence is the model's own label, not calibrated. No accuracy, speed or cost figure exists yet. There is no label check: confirming with the item's own label (typed, by camera or with the handheld's scanner) is `TODO(phase-3)`. |
| **6. Shortest route / less walking** | **Ruter** (`/ruter`, `src/features/routes/`), tab *Plukkliste* | A TypeScript port of our robot's router (parity tests against the Python agent) finds the shortest round over several floors, by lift when a trolley is in use. The *Plukkliste* tab is always there and plans a pick round from start and back for the items Øyne or Stemme added; an empty list opens on an example restocking order of 5 SKUs. **The headline compares with a list sorted by shelf, which is what a WMS prints: 16 m saved, 10 % shorter (146 m against 162 m).** Against the order the list was written in, it is 70 m, 32 %, shown beside it as the second baseline (`RouteStats.tsx`). | **Works on a test map, and the saving is small.** The warehouse map is 4 shelves on two floors with a packing zone as start (*Testkart*, `TODO(phase-2)`); a four-shelf map can't prove much. The hotel cleaning round is the same router on the real night's hotel map, and there it is as short as room-number order. The big savings in a warehouse are slotting (fast movers closer to packing) and batching; neither is built, and nothing uses order history yet, which is the word in pain 6. |
| **9. Guidance in the worker's own language** | **Ruter → Plukkliste** (the guide cards, `src/features/picklist/PickingGuides.tsx`) and **Snakk gjennom roboten** (`/stemme`, `src/features/voice/`) | **The four work guides (*Varemottak, Plukking, Pakking, Retur*) show as cards on Plukkliste, with a switch between Norsk, Polski, Українська and English, without the voice agent** (`src/features/picklist/guides.ts`; the bokmål steps are the voice agent's own). Since round 5 they name only controls that exist (*Plukkliste*, *Plassering*, *Vis vei*): no "Beste rute" button, no tick-off, no hotel rooms or storerooms. **Since round 6 the choice is kept on this device** (`lobby:guide-sprak`, `src/features/picklist/language.ts`) instead of going back to Norsk on every visit, **and the pick list's own words follow it**: the heading, the stop list (floor, by lift or stairs, back to start), *Fjern*, *Legg til flere varer*, *Tøm plukklisten* and its *Angre*, in Polish, Ukrainian or English; catalogue names and shelf labels stay bokmål. The ElevenLabs voice agent answers in eleven languages; a spoken task for the robot only opens a confirm sheet. | **The cards work; the voice doesn't run here.** The Polish, Ukrainian and English steps are the team's translations, not yet checked by a native speaker (`TODO(phase-3)`). No agent id is set on our server, so `/stemme` says it isn't connected and is out of the menu. Guest-to-staff translation is not built. |

## Holio, 60 seconds at the stand (rehearse once; lead with pain 3)

Holio's brief says "pick one", so the stand path leads with pain 3 and shows 6 and 9 as what it plugs
into. Five physical items on the table, Øyne open on a phone (logged in, camera allowed, network on).

**How the phone reaches this build (decide before 14:00, team lead):** a phone's camera needs a secure
context (HTTPS, or `localhost`). The only HTTPS deployment (`lobby-sandy.vercel.app`) serves `main`,
which has neither the label gate nor the guides, and a phone on the laptop's `http://<ip>:3300` gets no
camera at all. So either this branch gets an HTTPS preview or tunnel the team lead agrees to, or Øyne
runs on the laptop's own webcam at `localhost`, which counts as a secure context. Write the chosen
way here and in `docs/DEMO.md` § 4.1: **[fill]**.

1. **Tap an item with readable text.** The card shows *Tekst på pakken* (what the model read) and
   *Sikker*; *Legg i plukkliste* is offered.
2. **Tap an item with no readable text.** It shows *Usikker, sjekk varen*, still with the guessed SKU,
   *Vis vei* and *Legg i plukkliste*. This is the domain review's stand question ("walk me from an unsure
   result to the pick list"): today the worker checks the item and decides; the card doesn't stop them.
3. ***Vis vei*:** the pick round, with the saving against a list sorted by shelf (the baseline a WMS
   prints), read off the screen.
4. **Switch the work guides to *Polski*** on Plukkliste (the translations are ours, not yet checked by
   a native speaker).

Say before he asks: the camera is for exceptions (receiving, returns, packing), not every pick, and
"not measured yet" until the 20-item run below exists. On returns, photograph the item, never the
parcel: a shipping label carries a customer's name and address, and Øyne would send it to a US
processor (nothing on the phone covers labels or people). A hardware scan through Zebra's DataWedge
would need a label field, which this build doesn't have. If the detector hasn't loaded or has failed,
there are no live boxes, but the shutter still sends the whole frame, so start the phone a minute early.

## How it would fit Holio Ops

- Holio Ops runs React and TypeScript in Capacitor on Zebra TC27s. Øyne and the pick route are React
  components that call one server route each (`/api/identify`, the router in the browser), so they
  could run in that webview. Untested on a TC27.
- **20,000 SKUs, not 12:** Claude reads the pack (brand, size, colour, any text), a text or embedding
  search over the WMS catalogue returns the top five with photo and bin, and the picker taps one. The
  catalogue never goes in the prompt.
- **The open order narrows the catalogue (the domain review's point):** unknown items turn up at receiving,
  where the candidates are the open purchase order's 10–40 lines, and at returns, where they are the
  1–5 lines of the customer's original order. Matching against those lines, not 20,000 SKUs, is where
  accuracy jumps, and today's design (candidates in the prompt) already has that shape. Items with no
  text at all (a plain T-shirt in a polybag) need the shop's own product images, which Holio already
  pulls from Shopify, plus the size and colour on the bag's sticker.
- **Speed is the picker's cost:** an Opus-class call per scan may take seconds; measure it first, and if
  it is over about 3 s, try a smaller model first and fall back to the larger one.
- **A wrong pick is worse than "I don't know":** today an unsure match is only labelled *Usikker, sjekk
  varen*; the worker can still add it to the list. In Holio Ops the picker would scan the shelf label with the TC27's
  hardware scanner (the industry's pick confirmation), so a wrong guess can't become a wrong shipment.
- **The camera is for exceptions, not every pick.** Picks come from orders; the worker knows what to
  look for. Unknown items show up at **receiving** (which purchase-order line is this?), **returns**
  (which SKU, resellable?) and **packing** (is this the right item?, pain 4). A warehouse picking 5,000
  lines a day with 2 % unreadable labels makes about 100 scans; at roughly a US cent a scan (our code
  comment's estimate for an Opus-class call, not measured) that is about ten kroner a day. Live boxes
  for an eight-hour shift would drain a TC27's battery, so a warehouse mode detects on a tap.
- **Cost:** the whole-frame *Omgivelser* scan adds nothing in a warehouse and costs money per device
  hour; a warehouse mode keeps it off and identifies on a tap.
- **The handover is a warehouse pain too:** the *Overlevering 06:00* page (owners, deadlines, *Kvitter
  mottatt*) has the shape of an evening-to-morning warehouse handover: what wasn't picked, which carrier
  pickup was missed, which returns are waiting.

## What we would do first (and haven't)

1. **Put numbers on pain 3 (about 1 h):** 20 real items with no barcode or a torn label (add them to
   the catalogue, plus 3 that are *not* in it, to show *Ikke i katalogen* fires) through `/api/identify`
   on a phone; report right / unsure / wrong, median seconds and cost per scan (cache tokens priced),
   with the run file in `docs/checks/`. Until then we say "not measured".
2. **A warehouse map and catalogue (about 2 h):** a packing table as start, 5 aisles × 8 bins, one
   mezzanine with a lift for the trolley, 20 test SKUs from a made-up web shop (cosmetics, coffee, a
   T-shirt in a polybag), and a *Hotell / Lager* switch.
3. **Slotting from order history:** 30 days of test orders for a made-up web shop, picks counted per
   SKU, and "move these 5 fast movers next to packing: about X m less walking a day" with the router we
   already have. That is pain 6 as the brief words it.
4. **Ask Holio** the two open questions in `docs/PLAN.md`: do three pains in one product count for or
   against us, and can we borrow a TC27 and a test catalogue for a week?

Sourced figure for the Holio slide: in warehouse picking, "travel time can account for 50 % or more of
total order picking time" (Supply Chain Digest, Cliff Holste, 12 Mar 2014; link in `docs/DEMO.md`
§ 1). Nothing else on this page is a measurement.
