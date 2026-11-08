# DPA.md — Databehandleravtale for en Fettero-pilot (utkast)

> **For the hotel that says yes on Monday** (asked for in the marketing and legal reviews): a pilot sees the hotel's guest
> data, so the hotel will want an Art. 28 agreement before anything is sent. This is a one-page draft
> in Norwegian, ready to fill in. **Not reviewed by a lawyer; draft of Sun 8 Nov 2026.** It is built on
> the European Commission's standard contractual clauses between controllers and processors
> ([Implementing Decision (EU) 2021/915](https://eur-lex.europa.eu/eli/dec_impl/2021/915/oj), adopted
> under GDPR Art. 28(7)), which are part of the EEA Agreement (Joint Committee decision 336/2022, in
> force in the EEA from 10 Dec 2022, [EEA-Lex](https://www.efta.int/eea-lex/32021D0915)). The clauses
> are used unchanged; we fill in the choices and the four annexes. Background: `docs/PRIVACY.md`.
> **Open before anyone signs:** Fettero is not yet a company with an organisation number, and the
> pilot's server store (where data lives once it leaves the hotel's device) is not built.
> **Changed at about 07:45 (legal review):** room 210's purpose in *Formål* (the occupant's safety
> and a right guest register, revenue a side effect; the Art. 6(4) test in `docs/PRIVACY.md` § 10.2),
> point 4 says *aldri kort-id, aldri klokkeslett*, point 5 rules out investigating staff and
> per-person response times, point 6 and *Varighet* agree on who keeps the safety extract, and
> Vercel's plan and region are a team check (Vedlegg IV).

## Avtalen

1. **Partene.** Hotellet er **behandlingsansvarlig**. Fettero er **databehandler** (GDPR art. 28).
   Partene i vedlegg I.
2. **Vilkårene.** EU-kommisjonens standardavtalevilkår for behandlingsansvarlige og databehandlere
   (gjennomføringsbeslutning (EU) 2021/915), uendret, med disse valgene:
   - Klausul 5 (tiltredelse): ikke brukt.
   - Klausul 7.7 (underdatabehandlere): **alternativ 2, generell skriftlig godkjenning**. Fettero
     varsler hotellet skriftlig **30 dager** før en underdatabehandler legges til eller byttes, og
     hotellet kan protestere. Listen i vedlegg IV.
   - Klausul 9.2 (brudd hos databehandleren): varsel til hotellet uten ugrunnet opphold, og **senest
     24 timer** etter at Fettero ble kjent med bruddet, så hotellet rekker 72-timersfristen overfor
     Datatilsynet (art. 33).
   - Tillegg som ikke strider mot vilkårene (klausul 2): punkt 3–6 her.
3. **Ingen skriving i hotellets systemer.** Piloten leser bookingsystemet (lesetilgang). Fettero
   endrer aldri en booking og selger aldri et rom; et rom går til resepsjonen, som gjør endringen.
4. **Ett signal per rom fra dørlåsen, aldri kort-id, aldri klokkeslett.** Fettero tar ikke imot dørlåsens logg.
   Hotellet (eller låsleverandørens rapport) gir per gjesterom ett signal uten klokkeslett: et gjestekort
   står i energibryteren, eller ingen gjestekort er brukt i døra eller satt i energibryteren siden
   kl. 18:00. Kort for ansatte, hovedkort og nødkort fjernes før noe sendes. Har hotellet
   ikke en slik rapport, bruker piloten nattevaktens egen romsjekk i stedet.
5. **Ingen ytelsesmåling av ansatte.** Navn på ansatte står i overleveringen for å vise hvem som eier
   og har bekreftet hva. Fettero lager aldri statistikk per person, heller ikke av svartider (når
   noen kvitterte for eller ble varslet om en sak). **Fettero brukes aldri til å finne ut hvem som
   kodet et kort eller til å granske en ansatt;** et avvik som et rom i bruk uten booking løses med
   gjesten og registreringen, ikke med låsens ansattlogg, som Fettero heller ikke mottar (punkt 4).
6. **Slutt.** Når piloten slutter (fire uker, eller tidligere), leverer Fettero sikkerhetsutdraget
   (vedlegg II, *Varighet og lagring*) til hotellet, sletter deretter alt, også sin kopi av utdraget,
   innen **30 dager**, eller leverer alt tilbake hvis hotellet ber om det, og bekrefter slettingen
   skriftlig (art. 28 nr. 3 bokstav g). Fettero beholder ingenting etter pilotens slutt; hvor lenge
   utdraget oppbevares, bestemmer hotellet som behandlingsansvarlig.

Signert for hotellet: ______________________ Dato: ________
Signert for Fettero: _______________________ Dato: ________

## Vedlegg I: Partene

| | Navn, org.nr., adresse | Kontaktperson | Rolle |
|---|---|---|---|
| Hotellet | [fylles ut] | [daglig leder eller driftssjef] | Behandlingsansvarlig |
| Fettero | **[ikke stiftet ennå: selskapet signerer når det er registrert]** | Hamad, ShirazIQ | Databehandler |

## Vedlegg II: Beskrivelse av behandlingen

| | |
|---|---|
| **Formål** | Lage hotellets overlevering kl. 06:00 på én side: åpne saker med eier og frist, rom som kan selges etter at resepsjonen har bekreftet, hva som ble gjort i natt, og kvitteringen. Dørlåssignalet brukes til to ting: (1) rom som står tomme etter avreise, så resepsjonen kan bekrefte og selge dem; (2) **rom i bruk uten registrert opphold, så ingen ny gjest selges inn i et bebodd rom og hotellets gjesteregister er riktig** (utlendingsforskriften § 4-25; rutiner for evakuering, forskrift om brannforebygging § 12 b). Formålet med (2) er gjestens sikkerhet og å vite hvem som er i bygget; en natt som blir fakturert, er en bivirkning, ikke formålet. Art. 6(4)-vurderingen: `docs/PRIVACY.md` § 10.2. |
| **Registrerte** | Hotellets gjester (bookede og innsjekkede); hotellets ansatte som står i overleveringen (navn og rolle); nattevakten som registrerer. |
| **Opplysninger** | Fra bookingsystemet: gjestens navn, rom, ankomst og avreise, om utsjekken er registrert. Fra dørlås og energibryter: ett signal per rom (se punkt 4), aldri kort-id, navn, klokkeslett eller ansattes kort. Fra nattevakten: rom, funn, klokkeslett, hennes navn og et kort notat. Fra overleveringen: hvem som bekreftet et rom og hva som ble sjekket (folio, bagasje, nøkkelkort), hvem som kvitterte og når. **Ingen** betalingskort, fødselsnummer eller helseopplysninger. |
| **Særlige kategorier** | Ingen. Nattevaktens notat gjelder rommet og oppgaven, aldri en gjests helse. |
| **Behandlingen** | Lese, sammenstille og vise siden; skrive den ut. Ingen språkmodell på siden: hver linje er avledet av kildene. |
| **Varighet og lagring** | Pilotens fire uker. Dørlåssignalet slettes 24 timer etter overleveringen det inngikk i. Nattevaktens registreringer slettes etter **30 dager** på enheten (konstanten `RETENTION_DAYS` i `src/features/staffinput/retention.ts`, brukt når loggen leses og skrives). En overlevering lagres [hotellet bestemmer; forslag 30 dager, samme tall], deretter slettes den. Sikkerhetslinjene uten navn (sted, siden når, om skilt ble satt ut, **hvilken rolle** som ble varslet og når: vaktmester, resepsjon) er sikkerhetsutdraget. Det beholdes **av hotellet**, ikke av Fettero [hotellet bestemmer; forslag tre år som standard, den relative foreldelsesfristen for et erstatningskrav, foreldelsesloven § 9 nr. 1; en linje knyttet til en meldt skade holdes til kravet er avgjort, fordi fristen løper fra skadelidte fikk kunnskap, og § 9 nr. 2 har en ytre grense på 20 år]. Ved pilotens slutt leverer Fettero utdraget til hotellet (punkt 6); i pilotbygget er utdraget den signerte utskriften. Utskriften makuleres etter vakten (står på arket), bortsett fra sikkerhetslinjene. |
| **Hvor** | I pilotbygget ligger registreringer og kvitteringer i nettleseren på hotellets egen enhet. Appen kjører hos Vercel; uten satt region kjører funksjonene i Vercels standardregion `iad1` (Washington, D.C.). Før piloten: regionen settes til `arn1` (Stockholm) og skrives inn her (vedlegg IV). Før noe lagres på en server: en ny versjon av dette vedlegget. |

## Vedlegg III: Tekniske og organisatoriske tiltak

Innlogging med roller kontrollert på serveren; passord som scrypt-hasher; signert sesjonskapsel
(HttpOnly, SameSite=Lax, 12 timer); en innholdssikkerhetspolicy som starter fra bare egen opprinnelse (`default-src 'self'`); nøkler
bare på serveren; ingen analyseverktøy eller sporing; hemmeligheter skannes bort fra git; ingen
database i dag. Detaljer med filstier: `docs/PRIVACY.md` § 8. For piloten i tillegg: signalet reduseres
hos hotellet (punkt 4); egen brukerkonto per person i stedet for felles passord; sesjoner som kan trekkes tilbake én og én;
tilgang fjernes samme dag en ansatt slutter. Kjente hull som må lukkes før piloten: `docs/PRIVACY.md` § 8, *Known gaps*.

## Vedlegg IV: Underdatabehandlere

| Underdatabehandler | Hva | Overføringsgrunnlag (sjekket 8.11.2026, `docs/PRIVACY.md` § 3.1) | I piloten? |
|---|---|---|---|
| Vercel Inc. (USA) | Drift av appen; hver forespørsel går gjennom den. **Region:** ingen satt i dag, så standarden `iad1` (Washington, D.C.); i piloten `arn1` (Stockholm) ([Vercel, *Regions*](https://vercel.com/docs/regions)) | EU–US Data Privacy Framework (aktiv til 29.4.2027); databehandleravtalen gjelder Pro- og Enterprise-planer. **Teamsjekk før signering (teamleder): hvilken plan prosjektet har, og at regionen er satt; skriv begge inn her med dato** | Ja |
| Anthropic (USA) | Bare kameraet (Robotens øyne) | Standardkontraktsvilkår (2021/914) i Anthropics databehandleravtale; ikke på DPF-listen | **Nei**, avslått |
| ElevenLabs (Eleven Labs Inc., USA) | Bare AI-resepsjonisten | EU–US Data Privacy Framework (aktiv til 9.2.2027); standardkontraktsvilkår som reserve | **Nei**, avslått |

## Before a pilot starts (not part of the agreement)

- A lawyer reads this draft and `docs/PRIVACY.md` § 10 (the Art. 6(4) test for the lock signal, now
  with a column for room 210, and the two Norwegian provisions it leans on, marked **to verify**).
- **Team check (team lead, minutes):** the Vercel plan (its DPA covers only Pro and Enterprise) and
  the function region (`arn1`, Stockholm, set in `vercel.json` or the project settings); write both
  into Vedlegg IV with the date (`docs/PRIVACY.md` § 7). **Not done.**
- A DPIA, not just a screening (legal review): the software-only pilot combines datasets (the booking
  system, the lock signal and the night clerk's entries) and covers employees, two of the criteria in
  the Article 29 Working Party's DPIA guidelines (WP248 rev.01, endorsed by the EDPB), and two criteria
  is the usual sign that one is needed. Two pages: purpose, the data flow (`docs/PRIVACY.md` § 10), the
  risks (re-identification through the booking system, staff monitoring creep, a room resold wrongly,
  the 210 row used to find who coded a card, response times added up per person),
  the measures, the residual risk. Checked also against Datatilsynet's list of processing that always
  needs a DPIA (Art. 35(4)). The camera and the robot need their own before they are switched on
  (`docs/PRIVACY.md` § 7). **To do.**
- The hotel's privacy notice gets the sentence in `docs/PRIVACY.md` § 10.2.
