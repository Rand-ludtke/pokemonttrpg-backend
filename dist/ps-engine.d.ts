/**
 * Pokemon Showdown Battle Engine Wrapper
 *
 * This wraps the official Pokemon Showdown simulator (BattleStream) to provide
 * battle logic that exactly matches PS's mechanics. It translates between our
 * backend's data format and PS's protocol.
 */
import { BattleState, BattleAction, TurnResult, Player } from "./types";
interface PSRequest {
    rqid?: number;
    teamPreview?: boolean;
    forceSwitch?: boolean[];
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
 * PSEngine wraps Pokemon Showdown's BattleStream to provide accurate battle mechanics.
 */
export declare class PSEngine {
    private readonly options?;
    private battle;
    private state;
    private playerIdToSide;
    private sideToPlayerId;
    private pendingChoices;
    private turnLog;
    private turnAnim;
    constructor(options?: {
        format?: string;
        seed?: number[];
    } | undefined);
    /**
     * Initialize a battle with the given players.
     * Teams should be in our Pokemon format - they will be converted to PS packed format.
     */
    initializeBattle(players: Player[], options?: {
        seed?: number[];
    }): Promise<BattleState>;
    /**
     * Convert our Pokemon team to PS packed format
     */
    private convertTeamToPacked;
    /**
     * Start listening to PS streams
     */
    private startStreamListeners;
    /**
     * Parse PS log lines into our animation events
     */
    private parseLogToAnimations;
    /**
     * Extract pokemon ID from PS ident like "p1a: Pikachu"
     */
    private extractPokemonId;
    /**
     * Wait for both players to have requests
     */
    private waitForRequests;
    /**
     * Get the current request for a player (what choices they need to make)
     */
    getRequest(playerId: string): PSRequest | null;
    /**
     * Check if the battle needs a team preview choice
     */
    isTeamPreview(): boolean;
    /**
     * Check if a player needs to make a force switch (fainted Pokemon)
     */
    needsForceSwitch(playerId: string): boolean;
    /**
     * Submit a team order for team preview
     */
    submitTeamOrder(playerId: string, order: number[]): Promise<void>;
    /**
     * Submit a force switch choice
     */
    forceSwitch(playerId: string, toIndex: number): Promise<TurnResult>;
    /**
     * Process a turn with the given actions
     */
    processTurn(actions: BattleAction[]): Promise<TurnResult>;
    /**
     * Convert our action to PS choice format
     */
    private actionToChoice;
    /**
     * Find the index of a move in the current request
     */
    private findMoveIndex;
    /**
     * Sync our state mirror from PS's current state
     */
    private syncStateFromPS;
    /**
     * Parse PS status string to our format
     */
    private parseStatus;
    /**
     * Check if the battle has ended
     */
    isEnded(): boolean;
    /**
     * Get the winner's player ID (or null if no winner yet)
     */
    getWinner(): string | null;
    /**
     * Get the full battle log
     */
    getLog(): string[];
    /**
     * Get the current battle state
     */
    getState(): BattleState;
}
export default PSEngine;
