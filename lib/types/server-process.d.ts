import { type ChildProcess } from 'node:child_process';
import type { Config } from './config.ts';
import type { GraphifyCommandRequest } from './commands.ts';
/** Tested default Graphify version pinned for reproducible marketplace deployments. */
export declare const DEFAULT_GRAPHIFY_VERSION = "0.9.57";
/**
 * LLM SDK extras Graphify imports lazily for one backend.
 *
 * `graphifyy` ships no LLM SDK by default: the OpenAI-compatible backends
 * (`openai`, `deepseek`, `gemini`, `kimi`, `ollama`) import `openai`, and
 * `claude` imports `anthropic`. A runtime installed without them parses code but
 * fails every semantic chunk, so the uv fallback must ask for the SDK it needs.
 */
export declare function llmExtrasForBackend(backend?: string | null): string[];
/**
 * Build the `--with` package spec for the uv fallback.
 * @param version - graphifyy version to run.
 * @param extras - extras the runtime needs, deduplicated in order.
 * @returns the pip-style spec, for example `graphifyy[mcp,openai]==0.9.57`.
 */
export declare function uvPackageSpec(version: string, extras?: readonly string[]): string;
/**
 * Resolves the launcher that runs a package entry point without installing it.
 *
 * `uvx` and `uv tool run` are the same engine; the subcommand form is used only
 * when `uvx` is missing from PATH. Neither form reads the session project, so a
 * repository holding `pyproject.toml` is left untouched by a `/graphify` run.
 *
 * @param spec - pinned package spec, for example `graphifyy[mcp]==0.9.57`.
 * @param entryPoint - console script exported by that package.
 * @param tail - arguments appended after the entry point.
 * @returns the launcher, or null when neither uvx nor uv is on PATH.
 */
export declare function resolveUvEntryPointLauncher(spec: string, entryPoint: string, tail?: readonly string[]): {
    command: string;
    args: string[];
} | null;
/** Command used to start a local Graphify process. */
export interface GraphifyCommand {
    readonly command: string;
    readonly args: string[];
}
export interface RuntimeResolutionAvailable {
    readonly available: true;
    readonly command: string;
    readonly args: string[];
    readonly source: 'installed' | 'python' | 'uv' | 'custom';
    readonly version?: string;
}
export interface RuntimeResolutionUnavailable {
    readonly available: false;
    readonly reason: string;
    readonly remediation: string;
}
/** Structured result from attempting to discover the Graphify MCP server runtime. */
export type RuntimeResolution = RuntimeResolutionAvailable | RuntimeResolutionUnavailable;
export interface CliRuntimeResolutionAvailable {
    readonly available: true;
    readonly command: string;
    readonly args: string[];
    readonly source: 'installed' | 'uv' | 'custom';
}
export interface CliRuntimeResolutionUnavailable {
    readonly available: false;
    readonly reason: string;
    readonly remediation: string;
}
/** Structured result from attempting to discover the Graphify CLI runtime. */
export type CliRuntimeResolution = CliRuntimeResolutionAvailable | CliRuntimeResolutionUnavailable;
/**
 * Resolves diagnostic and launch information for the Graphify MCP runtime without throwing.
 * Gracefully reports `available: false` when Graphify is not yet installed.
 */
export declare function resolveGraphifyRuntime(config: Config, graphPath?: string): RuntimeResolution;
/**
 * Resolves the command and arguments to launch the Graphify MCP server.
 * Throws an actionable error if the runtime is unavailable.
 */
export declare function resolveGraphifyCommand(config: Config, graphPath?: string): GraphifyCommand;
/**
 * Resolves diagnostic and launch information for the Graphify CLI runtime without throwing.
 */
export declare function resolveGraphifyCliRuntime(config: Config, request: GraphifyCommandRequest, extras?: readonly string[]): CliRuntimeResolution;
/** Resolves the CLI used by the direct build and update command. */
export declare function resolveGraphifyCliCommand(config: Config, request: GraphifyCommandRequest, extras?: readonly string[]): GraphifyCommand;
/** Probes for installed Graphify version via `graphify --version`. */
export declare function getDetectedGraphifyVersion(): string | undefined;
/**
 * Inspects and returns diagnostic information regarding the resolved Graphify runtime.
 */
export declare function getRuntimeInfo(config: Config): {
    command: string;
    source: 'installed' | 'python' | 'uv' | 'custom' | 'unknown';
    version?: string;
};
export declare function isCommandAvailable(cmd: string): boolean;
export declare function findCommand(cmd: string): string | undefined;
/**
 * Gracefully terminates a child process using SIGTERM, escalating to SIGKILL
 * after a grace period if the process has not yet exited.
 * Resolves when the child process has confirmed closed/exited, or immediately
 * if the process is already dead.
 */
export declare function terminateChildProcess(child: ChildProcess, graceMs?: number): Promise<void>;
