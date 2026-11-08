/**
 * The camera's privacy notice, on top of Øyne in every state (before the camera starts, on a camera
 * problem, live). GDPR art. 13's first layer in the shape of Datatilsynet's camera sign: that a camera
 * is in use, the purpose, who is responsible (behandlingsansvarlig) and where to read more
 * (datatilsynet.no, kameraovervåking › informasjon og sletting). The line stays short; the details
 * open on a tap. Every claim here is checked against the code in docs/PRIVACY.md § 5: no audio
 * (`audio: false` in useCamera), no face recognition, nothing stored by our server, crops and whole
 * frames go to Claude (Anthropic, US, on its SCCs), and the Personer switch.
 */
export function PrivacyNotice() {
  return (
    <details className="group pointer-events-auto relative z-10 mx-4 mt-4 max-w-2xl self-start rounded-md bg-bg/75 px-3 py-2 text-sm text-text backdrop-blur-sm sm:mx-8 lg:mx-12">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">Kamera i bruk.</span> Ingen lyd, ingen ansiktsgjenkjenning, og vi lagrer ingen
        bilder. <span className="whitespace-nowrap underline underline-offset-2">Personvern</span>
      </summary>
      <div className="mt-2 flex flex-col gap-1 text-muted">
        <p>
          <span className="text-text">Formål:</span> kjenne igjen varer og omgivelser for roboten.
        </p>
        <p>
          <span className="text-text">Hva sendes:</span> utsnitt av det kameraet finner, og helbilder (hvert 10. sekund
          mens gjenkjenningen er på) med alt som er i bildet, også folk. De analyseres av Claude (Anthropic, USA, på
          EUs standardavtaler), som normalt sletter dem innen 30 dager.
        </p>
        <p>
          <span className="text-text">Personer:</span> slå av bryteren, så ber vi Claude utelate folk og det de har på
          seg.
        </p>
        <p>
          <span className="text-text">Behandlingsansvarlig:</span> hotellet. Innsyn og spørsmål: resepsjonen.
        </p>
      </div>
    </details>
  );
}
