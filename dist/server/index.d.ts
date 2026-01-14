import Engine from "../engine";
import { Action, Player } from "../types";
export interface ClientInfo {
    id: string;
    username: string;
}
export interface Room {
    id: string;
    name: string;
    players: {
        id: string;
        username: string;
        socketId: string;
    }[];
    spectators: {
        id: string;
        username: string;
        socketId: string;
    }[];
    engine?: Engine;
    battleStarted: boolean;
    turnBuffer: Record<string, Action>;
    replay: any[];
    phase?: "normal" | "force-switch" | "team-preview";
    forceSwitchNeeded?: Set<string>;
    forceSwitchTimer?: NodeJS.Timeout;
    forceSwitchDeadline?: number;
    challenges: Map<string, Challenge>;
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
export declare function computeNeedsSwitch(state: import("../types").BattleState): string[];
export declare function startServer(port?: number): void;
export {};
