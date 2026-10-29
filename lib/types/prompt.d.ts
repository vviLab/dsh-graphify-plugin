import type { Context } from '@deepseek-ai/cordis';
import type { PromptSection, DetectedGraph, ResolvedProject } from './types.ts';
import type { Config } from './config.ts';
import { ProjectResolver } from './project-resolver.ts';
/**
 * Placement of the Graphify guidance section inside the system prompt.
 *
 * The contract is positional, not cosmetic: the section must render after the
 * harness identity and deployment persona (order 0) and before plan/team policy
 * (500/600), PTC-only rules (800), and every single-tool guidance section (1000+).
 * `registerGraphifyPrompt` warns at mount when a harness build reports a
 * first-party order that violates this window.
 */
export declare const GRAPHIFY_SECTION_ORDER = 250;
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
 * @returns The prompt section registration.
 */
export declare function createGraphifyPromptSection(detectedGraph?: DetectedGraph | ResolvedProject | null, config?: Config, resolver?: ProjectResolver): PromptSection;
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
