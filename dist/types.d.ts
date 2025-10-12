export type StatName = "hp" | "atk" | "def" | "spa" | "spd" | "spe" | "acc" | "eva";
export type Stats = Record<Exclude<StatName, "acc" | "eva">, number> & {
    acc?: number;
    eva?: number;
};
export type StatStages = Record<StatName, number>;
export type TypeName = "Normal" | "Fire" | "Water" | "Electric" | "Grass" | "Ice" | "Fighting" | "Poison" | "Ground" | "Flying" | "Psychic" | "Bug" | "Rock" | "Ghost" | "Dragon" | "Dark" | "Steel" | "Fairy";
export type Category = "Physical" | "Special" | "Status";
export interface Move {
    id: string;
    name: string;
    type: TypeName;
    category: Category;
    power?: number;
    accuracy?: number;
    priority?: number;
    critRatio?: number;
    multiHit?: number | [number, number];
    pp?: number;
    onUse?: MoveEffect;
    switchesUserOut?: boolean;
}
export interface StatusEffectSpec {
    id: string;
    name: string;
    onAttackStatMultiplier?: (pokemon: Pokemon, state: BattleState) => number;
    onEndOfTurn?: (pokemon: Pokemon, state: BattleState, log: LogSink) => void;
}
export type NonVolatileStatusId = "burn" | "poison" | "toxic" | "paralysis" | "sleep" | "freeze" | "none";
export interface Pokemon {
    id: string;
    name: string;
    level: number;
    types: TypeName[];
    baseStats: Stats;
    currentHP: number;
    maxHP: number;
    stages: StatStages;
    status: NonVolatileStatusId;
    volatile: Record<string, any>;
    ability?: string;
    item?: string;
    moves: Move[];
}
export interface Player {
    id: string;
    name: string;
    team: Pokemon[];
    activeIndex: number;
    sideHazards?: {
        stealthRock?: boolean;
        spikesLayers?: number;
        toxicSpikesLayers?: number;
        stickyWeb?: boolean;
    };
    sideConditions?: {
        tailwindTurns?: number;
        reflectTurns?: number;
        lightScreenTurns?: number;
    };
}
export type ActionType = "move" | "switch";
export interface ActionBase {
    actorPlayerId: string;
    pokemonId: string;
    type: ActionType;
}
export interface MoveAction extends ActionBase {
    type: "move";
    moveId: string;
    targetPlayerId: string;
    targetPokemonId: string;
}
export interface SwitchAction extends ActionBase {
    type: "switch";
    toIndex: number;
}
export type Action = MoveAction | SwitchAction;
export type WeatherId = "none" | "sun" | "rain" | "sandstorm" | "hail" | "snow";
export type TerrainId = "none" | "electric" | "grassy" | "misty" | "psychic";
export interface TimedFieldEffect<T extends string> {
    id: T;
    turnsLeft: number;
}
export interface FieldState {
    weather: TimedFieldEffect<WeatherId>;
    terrain: TimedFieldEffect<TerrainId>;
}
export interface BattleState {
    turn: number;
    rngSeed?: number;
    players: Player[];
    field: FieldState;
    log: string[];
}
export interface TurnResult {
    state: BattleState;
    events: string[];
    anim?: AnimationEvent[];
}
export type MoveEffect = (ctx: MoveContext) => void;
export interface MoveContext {
    state: BattleState;
    user: Pokemon;
    target: Pokemon;
    move: Move;
    log: LogSink;
    utils: EngineUtils;
}
export type LogSink = (msg: string) => void;
export interface EngineUtils {
    dealDamage: (pokemon: Pokemon, amount: number) => number;
    heal: (pokemon: Pokemon, amount: number) => number;
    applyStatus: (pokemon: Pokemon, status: NonVolatileStatusId) => void;
    modifyStatStages: (pokemon: Pokemon, changes: Partial<Record<StatName, number>>) => void;
    getEffectiveSpeed: (pokemon: Pokemon) => number;
    getEffectiveAttack: (pokemon: Pokemon, category: Category) => number;
    emitAnim: (event: AnimationEvent) => void;
    rng: () => number;
}
export interface BattleRuleset {
    initializeBattle(players: Player[], options?: {
        seed?: number;
    }): BattleState;
    processTurn(actions: Action[]): TurnResult;
    onMoveExecute(handler: (move: Move, user: Pokemon, target: Pokemon, state: BattleState, log: LogSink) => void): void;
    onStatusTick(handler: (pokemon: Pokemon, status: NonVolatileStatusId, state: BattleState, log: LogSink) => void): void;
    onSwitchIn(handler: (pokemon: Pokemon, state: BattleState, log: LogSink) => void): void;
}
export declare const stageMultiplier: (stage: number, positiveBase?: number, negativeBase?: number) => number;
export declare const clamp: (n: number, min: number, max: number) => number;
export interface AnimationEvent {
    type: string;
    payload?: any;
}
