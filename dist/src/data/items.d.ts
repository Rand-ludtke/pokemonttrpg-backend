import { BattleState, Category, LogSink, Pokemon } from "../types";
export interface Item {
    id: string;
    name: string;
    onModifyAtk?: (pokemon: Pokemon, atk: number, category: Category) => number;
    onModifyDef?: (pokemon: Pokemon, def: number, category: Category) => number;
    onModifySpeed?: (pokemon: Pokemon, speed: number) => number;
    onModifyDamage?: (pokemon: Pokemon, damage: number) => number;
    onEndOfTurn?: (pokemon: Pokemon, state: BattleState, log: LogSink) => void;
    onWeatherDuration?: (weatherId: string, current: number) => number;
}
export declare const Items: Record<string, Item>;
export declare function mergeItems(map: Record<string, Item>): void;
