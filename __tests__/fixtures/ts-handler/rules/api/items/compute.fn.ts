/**
 * TypeScript handler fixture. Deliberately exercises the three things that only work if the
 * *bundled action* really ran bffless's esbuild-backed `bundleHandler`:
 *  - TS-only syntax (the `interface` + type annotations) that must be stripped,
 *  - a type-only import of a bare specifier, which esbuild must erase rather than try to
 *    resolve (the confinement plugin rejects real bare imports),
 *  - a relative import, which must be *inlined* into the emitted bundle.
 */
import type { HandlerContext } from "bffless/handlers";
import { SURCHARGE, addSurcharge } from "./pricing";

interface Item {
  price: number;
}

export default function handler({ steps }: HandlerContext) {
  const items = ((steps?.load as { items?: Item[] } | undefined)?.items ??
    []) as Item[];
  const subtotal = items.reduce(
    (sum: number, item: Item) => sum + item.price,
    0,
  );
  return { total: addSurcharge(subtotal), surcharge: SURCHARGE };
}
