import { Move, Player, Pokemon, TypeName } from "../types";
export interface ExternalMove {
    id: string;
    name: string;
    type: TypeName;
    category: "Physical" | "Special" | "Status";
    basePower?: number;
    accuracy?: number;
    priority?: number;
}
export interface ExternalSpecies {
    id: string;
    name: string;
    types: TypeName[];
    baseStats: any;
    moves: string[];
}
export interface ExternalDexData {
    species: Record<string, ExternalSpecies>;
    moves: Record<string, ExternalMove>;
}
export interface ExternalTeamPokemon {
    speciesId: string;
    level?: number;
    nickname?: string;
    moves: string[];
}
export interface ExternalTeam {
    playerId: string;
    name: string;
    party: ExternalTeamPokemon[];
}
export declare function mapMove(ext: ExternalMove): Move;
export declare function mapPokemon(idPrefix: string, idx: number, sp: ExternalSpecies, tp: ExternalTeamPokemon, moveMap: (id: string) => Move): Pokemon;
export declare function mapTeamToPlayer(team: ExternalTeam, dex: ExternalDexData): Player;
export declare function mapMatchToPlayers(teams: [ExternalTeam, ExternalTeam], dex: ExternalDexData): Player[];
