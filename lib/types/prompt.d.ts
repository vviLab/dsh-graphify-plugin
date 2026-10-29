import type { Context } from '@deepseek-ai/cordis';
import type { PromptSection, DetectedGraph, ResolvedProject } from './types.ts';
import type { Config } from './config.ts';
import { ProjectResolver } from './project-resolver.ts';
/**
 * Fallback placement of the Graphify guidance section inside the system prompt.
 *
 * The section carries third-party tool guidance, so its window is the external
 * tool-server band: it must render after every native per-tool guidance section
 * (`TOOL_*`, orders 1000–3000) and before the SDK tool conventions
 * (`TOOLS_SDK`, 5000). `registerGraphifyPrompt` prefers the harness' own
 * `MCP_SERVERS` slot when the registry publishes it and falls back to this value
 * when it does not.
 */
export declare const GRAPHIFY_SECTION_ORDER = 3100;
/**
 * Creates the Graphify decision policy prompt section for coding agents.
 *
 * The text is state-aware: it resolves the assembling session's project on
 * every assembly and reports either usable graph access or the absence of a
 * graph, never both. Tool names follow the configured prefix so the prose and
 * the registered tool surface cannot disagree.
 *
 * @param detectedGraph - Project detected at mount time, used for bare assembly.
 * @param config - Plugin configuration providing tool prefix and surface mode.
 * @param resolver - Session-scoped project resolver.
 * @param order - Resolved placement order; defaults to {@link GRAPHIFY_SECTION_ORDER}.
 * @returns The prompt section registration.
 */
export declare function createGraphifyPromptSection(detectedGraph?: DetectedGraph | ResolvedProject | null, config?: Config, resolver?: ProjectResolver, order?: number): PromptSection;
/**
 * Registers the Graphify prompt section on ctx.systemPrompt if available.
 *
 * @param ctx - DSH context owning the system prompt registry.
 * @param detectedGraph - Project detected at mount time, used for bare assembly.
 * @param config - Plugin configuration providing tool prefix and surface mode.
 * @param resolver - Session-scoped project resolver.
 * @returns The registration disposer, or a no-op when the registry is absent.
 */
export declare function registerGraphifyPrompt(ctx: Context, detectedGraph?: DetectedGraph | ResolvedProject | null, config?: Config, resolver?: ProjectResolver): () => void;
