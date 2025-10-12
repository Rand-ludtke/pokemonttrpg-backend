import { Move } from "../../types";
import { SpeciesEntry } from "../pokedex-registry";
export declare function convertShowdownSpecies(raw: Record<string, any>): Record<string, SpeciesEntry>;
export declare function convertShowdownMoves(raw: Record<string, any>): Record<string, Move>;
