import type { ActionDefinition, ActionPlayback, KichiEnvironment, KichiEnvironmentsConfig, KichiStaticConfig, PoseType } from "./types.js";
export declare function getMusicTitleEnum(): string[];
export declare function getMusicTitleExamples(): string[];
export declare function loadStaticConfig(): KichiStaticConfig;
export declare const VALID_ENVIRONMENTS: KichiEnvironment[];
export declare function loadEnvironmentsConfig(): KichiEnvironmentsConfig;
export declare function isKichiEnvironment(value: unknown): value is KichiEnvironment;
export declare function resolveJoinEnvironmentHost(params: {
    environment?: unknown;
    host?: unknown;
}): {
    environment?: KichiEnvironment;
    host?: string;
    error?: string;
};
export declare function normalizeMusicTitles(value: unknown): {
    titles: string[];
    invalidTitles: string[];
};
export declare function getActionDefinition(poseType: PoseType, action: string): ActionDefinition;
export declare function getActionPlayback(action: ActionDefinition): ActionPlayback;
