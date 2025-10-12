External data integration

To keep this project clean and avoid bundling copyrighted databases, this backend supports hot-loading abilities, items, moves and species from external sources like Pokémon Showdown and Pokémon Essentials without embedding their code.

How to use:
- Drop-in providers under `external/` (ignored by git):
  - `external/showdown/abilities.js` exporting an object `{ [id]: Ability }`
  - `external/showdown/items.js` exporting an object `{ [id]: Item }`
  - (optionally) `external/showdown/moves.js`, `external/showdown/pokedex.js` formatted for adapters
  - `external/essentials/animations.js` exporting a map from AnimationEvent.type to Essentials keys
- Call the merge functions during server boot or before a match:

Example (TypeScript/ESM or transpiled CommonJS):

import path from 'path';
import { mergeAbilities } from './abilities';
import { mergeItems } from './items';

async function tryLoadShowdown() {
  try {
    const abilities = (await import(path.resolve('external/showdown/abilities.js'))).default;
    mergeAbilities(abilities);
  } catch {}
  try {
    const items = (await import(path.resolve('external/showdown/items.js'))).default;
    mergeItems(items);
  } catch {}
}

tryLoadShowdown();

Notes:
- This pattern lets you keep the official datasets locally on your Pi without committing them to this repo.
- The adapters in `src/adapters/` can be expanded to map Showdown/Essentials structures into the engine types.
