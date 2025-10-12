import { AnimationEvent } from "../types";
export interface EssentialsAnim {
    key: string;
    params?: Record<string, unknown>;
}
export declare function mapAnimationEventToEssentials(ev: AnimationEvent): EssentialsAnim | null;
