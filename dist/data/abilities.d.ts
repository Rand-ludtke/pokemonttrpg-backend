import { BattleState, Category, LogSink, Pokemon } from "../types";
export interface Ability {
    id: string;
    name: string;
    onSwitchIn?: (pokemon: Pokemon, state: BattleState, log: LogSink) => void;
    onModifyPriority?: (pokemon: Pokemon, priority: number) => number;
    onModifyAccuracy?: (pokemon: Pokemon, accuracy: number) => number;
    onModifyAtk?: (pokemon: Pokemon, atk: number, category: Category) => number;
    onModifyDef?: (pokemon: Pokemon, def: number, category: Category) => number;
    onModifyDamage?: (user: Pokemon, target: Pokemon, damage: number) => number;
    onModifySpeed?: (pokemon: Pokemon, speed: number) => number;
}
export declare const Abilities: Record<string, Ability>;
export declare function mergeAbilities(map: Record<string, Ability>): void;
