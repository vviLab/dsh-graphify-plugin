import type { Context } from '@deepseek-ai/cordis';
import type { Config } from './config.ts';
import type { SpawnEnvironmentResolution } from './spawn-env.ts';
/** Supplies the spawn environment that carries the configured LLM key for one invocation. */
export type SpawnEnvironmentSource = () => Promise<SpawnEnvironmentResolution>;
export interface CommandInvocation {
    commandId?: unknown;
    agent: {
        readonly session: {
            readonly header: {
                readonly cwd?: string;
            };
        };
    };
    rawInput: string;
    attachments?: readonly unknown[];
    signal: AbortSignal;
}
export type CommandResult = {
    kind: 'success';
    text?: string;
    sourceEventSeq?: number;
} | {
    kind: 'error';
    text: string;
};
export interface CommandDefinition {
    name: string;
    description: string;
    input?: {
        hint: string;
        images?: boolean;
    };
    recordInput?: boolean;
    handler: (invocation: CommandInvocation) => CommandResult | Promise<CommandResult>;
}
/** Parsed Graphify command supported by the direct DSH command surface. */
export interface GraphifyCommandRequest {
    readonly operation: 'build' | 'update';
    readonly projectRoot: string;
    readonly flags: readonly string[];
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        commands: {
            register: (def: CommandDefinition) => () => void;
            [key: string]: unknown;
        };
    }
}
export declare const ALLOWED_GRAPHIFY_FLAGS: readonly ["--force", "--no-cluster", "--code-only", "--no-viz"];
/**
 * Parses `/graphify [build|update] [path] [--force|--no-cluster|--code-only|--no-viz]` against the
 * receiving Session's project root.
 */
export declare function parseGraphifyCommand(rawInput: string, projectRoot: string): GraphifyCommandRequest;
/** Registers the `/graphify` build and incremental-update command. */
export declare function registerGraphifyCommand(ctx: Context, config: Config, defaultProjectRoot: string, resolveSpawnEnv?: SpawnEnvironmentSource): () => void;
/**
 * Turn a missing-SDK failure into the one install command that fixes it.
 *
 * `graphifyy` imports its LLM SDK lazily, so a runtime installed without the
 * matching extra parses code and then fails every semantic chunk. The raw chunk
 * errors repeat once per chunk and never say which extra the *runtime* needs,
 * which is why this reads the first one and restates it as one command.
 *
 * @param text - the failure text Graphify wrote to stderr.
 * @param backend - backend the invocation selected, when known.
 * @returns the note to append, or undefined when the failure is unrelated.
 */
export declare function missingSdkHint(text: string, backend?: string | null): string | undefined;
