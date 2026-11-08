# DPA.md — Databehandleravtale for en Fettero-pilot (utkast)

> **For the hotel that says yes on Monday** (the marketing juror, the law juror, round 4): a pilot sees the hotel's guest
> data, so the hotel will want an Art. 28 agreement before anything is sent. This is a one-page draft
> in Norwegian, ready to fill in. **Not reviewed by a lawyer; draft of Sun 8 Nov 2026.** It is built on
> the European Commission's standard contractual clauses between controllers and processors
> ([Implementing Decision (EU) 2021/915](https://eur-lex.europa.eu/eli/dec_impl/2021/915/oj), adopted
> under GDPR Art. 28(7)), which are part of the EEA Agreement (Joint Committee decision 336/2022, in
> force in the EEA from 10 Dec 2022, [EEA-Lex](https://www.efta.int/eea-lex/32021D0915)). The clauses
> are used unchanged; we fill in the choices and the four annexes. Background: `docs/PRIVACY.md`.
> **Open before anyone signs:** Fettero is not yet a company with an organisation number, and the
> pilot's server store (where data lives once it leaves the hotel's device) is not built.

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
4. **Ett signal per rom fra dørlåsen, aldri hvem.** Fettero tar ikke imot dørlåsens logg. Hotellet
   (eller låsleverandørens rapport) gir per gjesterom tidspunktet for siste inngang med gjestekort og om
   energibryteren står tom. Kort for ansatte, hovedkort og nødkort fjernes før noe sendes. Har hotellet
   ikke en slik rapport, bruker piloten nattevaktens egen romsjekk i stedet.
5. **Ingen ytelsesmåling av ansatte.** Navn på ansatte står i overleveringen for å vise hvem som eier
   og har bekreftet hva. Fettero lager aldri statistikk per person.
6. **Slutt.** Når piloten slutter (fire uker, eller tidligere), sletter Fettero alt innen **30 dager**,
   eller leverer det tilbake hvis hotellet ber om det, og bekrefter slettingen skriftlig (art. 28 nr. 3
   bokstav g).

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
| **Formål** | Lage hotellets overlevering kl. 06:00 på én side: åpne saker med eier og frist, rom som kan selges etter at resepsjonen har bekreftet, hva som ble gjort i natt, og kvitteringen. |
| **Registrerte** | Hotellets gjester (bookede og innsjekkede); hotellets ansatte som står i overleveringen (navn og rolle); nattevakten som registrerer. |
| **Opplysninger** | Fra bookingsystemet: gjestens navn, rom, ankomst og avreise, om utsjekken er registrert. Fra dørlås og energibryter: ett signal per rom (se punkt 4), aldri kort-id, navn eller ansattes kort. Fra nattevakten: rom, funn, klokkeslett, hennes navn og et kort notat. Fra overleveringen: hvem som bekreftet et rom og hva som ble sjekket (folio, bagasje, nøkkelkort), hvem som kvitterte og når. **Ingen** betalingskort, fødselsnummer eller helseopplysninger. |
| **Særlige kategorier** | Ingen. Nattevaktens notat gjelder rommet og oppgaven, aldri en gjests helse. |
| **Behandlingen** | Lese, sammenstille og vise siden; skrive den ut. Ingen språkmodell på siden: hver linje er avledet av kildene. |
| **Varighet og lagring** | Pilotens fire uker. Dørlåssignalet slettes 24 timer etter overleveringen det inngikk i. En overlevering lagres [hotellet bestemmer; forslag 30 dager], deretter slettes den. Utskriften makuleres etter vakten (står på arket). |
| **Hvor** | I pilotbygget ligger registreringer og kvitteringer i nettleseren på hotellets egen enhet. Før noe lagres på en server: en EU-region hos Vercel (ikke satt ennå) og en ny versjon av dette vedlegget. |

## Vedlegg III: Tekniske og organisatoriske tiltak

Innlogging med roller kontrollert på serveren; passord som scrypt-hasher; signert sesjonskapsel
(HttpOnly, SameSite=Lax, 12 timer); en innholdssikkerhetspolicy som starter fra bare egen opprinnelse (`default-src 'self'`); nøkler
bare på serveren; ingen analyseverktøy eller sporing; hemmeligheter skannes bort fra git; ingen
database i dag. Detaljer med filstier: `docs/PRIVACY.md` § 8. For piloten i tillegg: signalet reduseres
hos hotellet (punkt 4); egen brukerkonto per person i stedet for felles passord; tilgang fjernes samme
dag en ansatt slutter. Kjente hull som må lukkes før piloten: `docs/PRIVACY.md` § 8, *Known gaps*.

## Vedlegg IV: Underdatabehandlere

| Underdatabehandler | Hva | Overføringsgrunnlag (sjekket 8.11.2026, `docs/PRIVACY.md` § 3.1) | I piloten? |
|---|---|---|---|
| Vercel Inc. (USA) | Drift av appen; hver forespørsel går gjennom den | EU–US Data Privacy Framework (aktiv til 29.4.2027); databehandleravtalen gjelder Pro- og Enterprise-planer, **hvilken plan prosjektet har: sjekkes** | Ja |
| Anthropic (USA) | Bare kameraet (Robotens øyne) | Standardkontraktsvilkår (2021/914) i Anthropics databehandleravtale; ikke på DPF-listen | **Nei**, avslått |
| ElevenLabs (Eleven Labs Inc., USA) | Bare AI-resepsjonisten | EU–US Data Privacy Framework (aktiv til 9.2.2027); standardkontraktsvilkår som reserve | **Nei**, avslått |

## Before a pilot starts (not part of the agreement)

- A lawyer reads this draft and `docs/PRIVACY.md` § 10 (the Art. 6(4) test for the lock signal).
- A short DPIA screening for the software-only pilot, checked against Datatilsynet's list of
  processing that always needs a DPIA (Art. 35(4)); the camera and the robot need a full DPIA before
  they are switched on (`docs/PRIVACY.md` § 7). **To do.**
- The hotel's privacy notice gets the sentence in `docs/PRIVACY.md` § 10.2.
