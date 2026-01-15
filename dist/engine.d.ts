import { BattleAction, BattleRuleset, BattleState, AnimationEvent, LogSink, Move, Pokemon, TurnResult, NonVolatileStatusId, Player } from "./types";
type Handler<T extends any[]> = (...args: T) => void;
export declare class Engine implements BattleRuleset {
    private readonly options?;
    private state;
    private moveHandlers;
    private statusTickHandlers;
    private switchInHandlers;
    constructor(options?: {
        seed?: number;
        deterministicTies?: boolean;
    } | undefined);
    initializeBattle(players: Player[], options?: {
        seed?: number;
    }): BattleState;
    forceSwitch(playerId: string, toIndex: number): {
        state: BattleState;
        events: string[];
        anim: AnimationEvent[];
    };
    processTurn(actions: BattleAction[]): TurnResult;
    onMoveExecute(handler: Handler<[Move, Pokemon, Pokemon, BattleState, LogSink]>): void;
    onStatusTick(handler: Handler<[Pokemon, NonVolatileStatusId, BattleState, LogSink]>): void;
    onSwitchIn(handler: Handler<[Pokemon, BattleState, LogSink]>): void;
    private rng;
    private getPokemonById;
    private isWeatherSuppressed;
    private areItemsSuppressed;
    private isGrounded;
    private compareActions;
    private compareMoveActions;
    private actionPriority;
    private actionSpeed;
    private executeMove;
    private emitStatusTick;
    private emitSwitchIn;
    private utils;
    private getEffectiveSpeed;
    private getEffectiveAttack;
    private applyFieldDamageMods;
    private applySurvivalEffects;
    private modifyAccuracy;
    private modifyAttack;
    private modifyDefense;
    private modifyDamage;
    private rollCrit;
    private getMultiHit;
    setProtect(pokemon: Pokemon, enabled: boolean): void;
    getState(): BattleState;
}
export default Engine;
