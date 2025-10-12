import { Category, Move, Pokemon } from "./types";
export interface DamageEnv {
    rng: () => number;
}
export declare function calcDamage(user: Pokemon, target: Pokemon, move: Move, atk: number, def: number, env: DamageEnv): {
    damage: number;
    effectiveness: number;
    stab: number;
    roll: number;
};
export declare function chooseDefenseStat(target: Pokemon, category: Category): number;
