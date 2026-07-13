/** Relative import pulled in by `compute.fn.ts` — must be inlined into the bundled handler.
 *  `BFFLESS_TS_FIXTURE_MARKER` is asserted on in the smoke test as proof that esbuild
 *  actually bundled this module in, rather than merely stripping types from the entry. */
export const SURCHARGE = "BFFLESS_TS_FIXTURE_MARKER";

export function addSurcharge(subtotal: number): number {
  return subtotal + 1;
}
