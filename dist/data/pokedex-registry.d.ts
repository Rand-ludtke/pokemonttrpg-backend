import { Stats, TypeName } from "../types";
export interface SpeciesEntry {
    id: string;
    name: string;
    types: TypeName[];
    baseStats: Stats;
    abilities?: string[];
}
export declare const PokedexRegistry: Record<string, SpeciesEntry>;
export declare function mergeSpecies(map: Record<string, SpeciesEntry>): void;
export declare function getSpecies(id: string): SpeciesEntry | undefined;
