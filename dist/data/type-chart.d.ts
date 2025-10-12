import { TypeName } from "../types";
export declare const TYPE_CHART: Record<TypeName, Partial<Record<TypeName, number>>>;
export declare function typeEffectiveness(moveType: TypeName, targetTypes: TypeName[]): number;
