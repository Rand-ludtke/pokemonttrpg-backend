/**
 * Synchronous Pokemon Showdown Battle Engine
 *
 * This provides a synchronous interface to the PS BattleStream by running
 * the battle simulation synchronously (PS simulator supports this mode).
 */
import { BattleState, BattleAction, TurnResult, Player } from "./types";
interface PSRequest {
    rqid?: number;
    teamPreview?: boolean;
    forceSwitch?: boolean[];
    wait?: boolean;
    active?: Array<{
        moves: Array<{
            id: string;
            name: string;
            pp: number;
            maxpp: number;
            disabled?: boolean;
            target: string;
        }>;
        trapped?: boolean;
        canMegaEvo?: boolean;
    }>;
    side?: {
        name: string;
        id: string;
        pokemon: Array<{
            ident: string;
            details: string;
            condition: string;
            active: boolean;
            stats: {
                atk: number;
                def: number;
                spa: number;
                spd: number;
                spe: number;
            };
            moves: string[];
            baseAbility: string;
            item: string;
            pokeball: string;
            ability?: string;
        }>;
    };
}
/**
 * SyncPSEngine provides a synchronous interface to Pokemon Showdown's battle simulation.
 * It uses PS's Battle class directly (not the stream) for synchronous operation.
 */
export declare class SyncPSEngine {
    private readonly options?;
    private battle;
    private state;
    private playerIdToSide;
    private sideToPlayerId;
    private format;
    private lastLogIndex;
    private startSent;
    private rules?;
    constructor(options?: {
        format?: string;
        seed?: number | number[];
        rules?: any;
    } | undefined);
    /**
     * Initialize a battle with the given players.
     * Teams should be in our Pokemon format - they will be converted to PS packed format.
     */
    initializeBattle(players: Player[], options?: {
        seed?: number | number[];
    }): BattleState;
    /**
     * Convert our Pokemon team to PS packed format
     */
    private convertTeamToPacked;
    /**
     * Get the current request for a player
     */
    getRequest(playerId: string): PSRequest | null;
    /**
     * Get the active Pokemon's moves with current PP directly from PS engine
     * This is useful as a fallback when activeRequest is not available
     */
    getActiveMovesPP(playerId: string): Array<{
        id: string;
        name: string;
        pp: number;
        maxpp: number;
        target: string;
        disabled: boolean;
    }> | null;
    /**
     * Check if a player needs to make a force switch
     */
    needsForceSwitch(playerId: string): boolean;
    /**
     * Submit a force switch choice
     */
    forceSwitch(playerId: string, toIndex: number): TurnResult;
    /**
     * Process a turn with the given actions
     */
    processTurn(actions: BattleAction[]): TurnResult;
    /**
     * Check if the unlimited terastallization clause is enabled
     */
    private hasUnlimitedTeraClause;
    /**
     * Re-enable canTerastallize for all Pokemon (for unlimited tera clause)
     */
    private resetTerastallizeForAll;
    /**
     * Collect new log entries from PS battle
     * Filters out duplicate |start| blocks that PS may generate
     */
    private collectNewLogEntries;
    /**
     * Parse log entries into animation events
     */
    private parseLogToAnimations;
    /**
     * Extract side from PS ident like "p1a: Pikachu"
     */
    private extractSide;
    /**
     * Extract pokemon name from PS ident like "p1a: Pikachu"
     */
    private extractPokemonName;
    /**
     * Convert our action to PS choice format
     */
    private actionToChoice;
    /**
     * Find the index of a move (1-based)
     */
    private findMoveIndex;
    /**
     * Sync our state from PS's current state
     */
    private syncStateFromPS;
    /**
     * Parse PS status to our format
     */
    private parseStatus;
    /**
     * Check if battle has ended
     */
    isEnded(): boolean;
    /**
     * Get winner's player ID
     */
    getWinner(): string | null;
    /**
     * Get the full battle log
     */
    getLog(): string[];
    /**
     * Get the current state
     */
    getState(): BattleState;
    /**
     * Access the internal PS battle for advanced usage
     */
    getPSBattle(): any;
}
export default SyncPSEngine;
