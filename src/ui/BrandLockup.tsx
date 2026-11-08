import Image from "next/image";

/**
 * The Lobby logo as a horizontal lockup: the L mark beside the wordmark (cream on alpha, made for the dark
 * rail and top bar). Explicit sizes, so nothing shifts on load. The files are `public/brand/`; the proxy lets
 * them through before login (`src/features/auth/access.ts`).
 */
export function BrandLockup() {
  return (
    <span className="flex items-center gap-2">
      <Image src="/brand/lobby-mark.png" alt="Lobby" width={29} height={28} priority />
      <Image src="/brand/lobby-wordmark.png" alt="" width={72} height={20} priority />
    </span>
  );
}
