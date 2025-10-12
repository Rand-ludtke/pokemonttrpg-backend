import Engine from "../engine";
import { Action } from "../types";
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
    phase?: "normal" | "force-switch";
    forceSwitchNeeded?: Set<string>;
    forceSwitchTimer?: NodeJS.Timeout;
    forceSwitchDeadline?: number;
}
export declare function computeNeedsSwitch(state: import("../types").BattleState): string[];
export declare function startServer(port?: number): void;
