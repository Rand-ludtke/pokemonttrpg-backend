import Engine from "../engine";
import SyncPSEngine from "../sync-ps-engine";
import { Action, Player } from "../types";
export interface ClientInfo {
    id: string;
    username: string;
    trainerSprite?: string;
}
type BattleEngine = Engine | SyncPSEngine;
export interface Room {
    id: string;
    name: string;
    players: {
        id: string;
        username: string;
        socketId: string;
        trainerSprite?: string;
    }[];
    spectators: {
        id: string;
        username: string;
        socketId: string;
        trainerSprite?: string;
    }[];
    engine?: BattleEngine;
    battleStarted: boolean;
    startProtocolSent?: boolean;
    turnBuffer: Record<string, Action>;
    replay: any[];
    phase?: "normal" | "force-switch" | "team-preview";
    forceSwitchNeeded?: Set<string>;
    forceSwitchTimer?: NodeJS.Timeout;
    forceSwitchDeadline?: number;
    turnTimer?: NodeJS.Timeout;
    turnDeadline?: number;
    challenges: Map<string, Challenge>;
    lastPromptByPlayer?: Record<string, {
        turn: number;
        type: "move" | "wait" | "switch" | "team";
        rqid?: number;
    }>;
    teamPreviewPlayers?: Player[];
    teamPreviewOrders?: Record<string, number[]>;
    teamPreviewRules?: any;
}
type ChallengeStatus = "pending" | "launching" | "cancelled" | "declined";
interface ChallengeParticipant {
    playerId: string;
    username: string;
    socketId: string;
    accepted: boolean;
    trainerSprite?: string;
    playerPayload?: Player;
}
interface Challenge {
    id: string;
    roomId: string;
    createdAt: number;
    rules?: any;
    format?: string;
    status: ChallengeStatus;
    owner: ChallengeParticipant;
    target?: ChallengeParticipant;
    open: boolean;
}
export declare function computeNeedsSwitch(state: import("../types").BattleState, engine?: SyncPSEngine): string[];
export declare function startServer(port?: number): void;
export {};
