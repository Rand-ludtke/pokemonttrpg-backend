// Minimal shim for Showdown's internal type reference used by src/pokedex.ts
// This avoids bringing in the full Showdown repo just for types.
declare module '../sim/dex-species' {
  export type SpeciesDataTable = Record<string, any>;
}
