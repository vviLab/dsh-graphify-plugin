import type { Context } from '@deepseek-ai/cordis';
import type { GraphifyMcpClient } from './client.ts';
import type { Config } from './config.ts';
import type { ToolDefinition, ToolRunContext } from './types.ts';
import { ProjectResolver } from './project-resolver.ts';
export interface GraphifyToolOutput {
    text: string;
    isError?: boolean;
    meta?: unknown;
}
/**
 * Resolves the prefixed tool name consistently without accidental prefix collisions.
 * e.g. prefix 'graphify_' + 'query_graph' -> 'graphify_query_graph'
 *      prefix 'graphify_' + 'graphify_status' -> 'graphify_status' (preserved)
 *      prefix 'g' + 'get_node' -> 'gget_node' (never mistakenly stripped)
 *      prefix '' + 'query_graph' -> 'query_graph'
 */
export declare function getPrefixedToolName(baseName: string, prefix: string): string;
export declare function isPathContained(parentDir: string, childPath: string): boolean;
/**
 * Validates that model tool access to an explicit project path is allowed.
 * When `allowExternalProjects` is false, restricts model access to the active session workspace.
 */
export declare function validateProjectPathAccess(explicitPath: string | undefined, execution: ToolRunContext | undefined, config: Config): void;
/** Optional runtime facts a tool surface can report without owning them. */
export interface GraphifyToolDependencies {
    /**
     * Describes the LLM credential the next build would use, for diagnostics.
     * The description never contains the key itself.
     */
    describeLlm?: () => Promise<string>;
    /** Formats the running build jobs owned by the calling Session. */
    listJobs?: (sessionId?: string) => readonly string[];
}
/**
 * Creates Graphify's native tools, doctor tool, plus capability and resource accessors.
 *
 * The tool surface does not depend on graph presence: tools resolve the target
 * project per call and answer with an actionable error when a graph is missing.
 */
export declare function createGraphifyToolDefinitions(client: GraphifyMcpClient, config: Config, customResolver?: ProjectResolver, deps?: GraphifyToolDependencies): ToolDefinition[];
/**
 * Registers all configured Graphify tools into ctx.tools and returns a combined unregister disposer.
 *
 * @param ctx - DSH context owning the tool registry.
 * @param client - Graphify MCP client used by every tool body.
 * @param config - Plugin configuration providing surface mode and timeouts.
 * @param resolver - Session-scoped project resolver.
 * @returns The combined registration disposer.
 */
export declare function registerGraphifyTools(ctx: Context, client: GraphifyMcpClient, config: Config, resolver?: ProjectResolver, deps?: GraphifyToolDependencies): () => void;
