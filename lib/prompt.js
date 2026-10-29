import { getPrefixedToolName } from "./tools.js";
/**
 * Placement of the Graphify guidance section inside the system prompt.
 *
 * The contract is positional, not cosmetic: the section must render after the
 * harness identity and deployment persona (order 0) and before plan/team policy
 * (500/600), PTC-only rules (800), and every single-tool guidance section (1000+).
 * `registerGraphifyPrompt` warns at mount when a harness build reports a
 * first-party order that violates this window.
 */
export const GRAPHIFY_SECTION_ORDER = 250;
const DECISION_ENTRIES = [
    {
        scope: 'all',
        render: (name) => `- Architecture and concept discovery: use \`${name('query_graph')}\`; callers, callees, dependencies: \`${name('get_neighbors')}\`; call path between modules: \`${name('shortest_path')}\`.`,
    },
    {
        scope: 'all',
        render: (name) => `- Exact symbol or interface details: use \`${name('get_node')}\` with a label or ID.`,
    },
    {
        scope: 'all',
        render: (name) => `- Graph health, freshness, git sync: \`${name('graphify_status')}\`; pre-built reports and audits: \`${name('graphify_project_resource')}\` (\`resource: report|wiki|stats\`).`,
    },
    {
        scope: 'full',
        render: (name) => `- Hub abstractions: \`${name('god_nodes')}\`; cluster and module boundaries: \`${name('get_community')}\`; PR blast radius: \`${name('list_prs')}\` or \`${name('get_pr_impact')}\`.`,
    },
    {
        scope: 'full',
        render: (name) => `- Capability discovery and escape hatches: \`${name('graphify_capabilities')}\` then \`${name('graphify_call')}\`.`,
    },
];
const SOURCE_PRINCIPLE = [
    '### Authoritative Source Principle',
    '1. **Navigation first, source files authoritative**: use Graphify to locate files, then read the real source for implementation details.',
    '2. **Never edit blind**: do not modify code based only on a graph description.',
    '3. **Stop querying early**: once you have enough evidence, inspect or edit the files instead of issuing more graph queries.',
    '4. **Trivial tasks**: for a single obvious file, use direct filesystem tools.',
];
/**
 * Builds the guidance text for a session whose project has a knowledge graph.
 *
 * @param name - Resolves a base tool name to its registered, prefixed name.
 * @param isCompact - Whether the compact tool surface is registered.
 * @returns The rendered section text.
 */
function buildGraphPresentText(name, isCompact) {
    const decisions = DECISION_ENTRIES.filter((entry) => entry.scope === 'all' || !isCompact).map((entry) => entry.render(name));
    return [
        '## Graphify Knowledge Graph & Decision Policy',
        '',
        'This workspace has a local Graphify knowledge graph (graphify-out/graph.json) for structural navigation, dependency analysis, and architecture exploration.',
        '',
        '### Decision Policy: When to use Graphify',
        ...decisions,
        '',
        ...SOURCE_PRINCIPLE,
        '',
        '### Session Reports & Diagnostics',
        `- \`${name('graphify_status')}\` reports graph state, paths, and freshness for the active workspace.`,
        '- `graphify-out/GRAPH_REPORT.md` and `graphify-out/wiki/index.md` carry pre-built overviews when present.',
    ].join('\n');
}
/**
 * Builds the guidance text for a session with no knowledge graph.
 *
 * States the absence instead of asserting a capability the session does not
 * have, and gives the one instruction that resolves it.
 *
 * @param name - Resolves a base tool name to its registered, prefixed name.
 * @returns The rendered section text.
 */
function buildGraphMissingText(name) {
    return [
        '## Graphify Knowledge Graph & Decision Policy',
        '',
        'No Graphify knowledge graph is present for this session’s project: graphify-out/graph.json was not found.',
        '',
        `To create one, run \`/graphify build\` in the project root. Until a graph exists, use direct filesystem tools; once it exists, \`${name('query_graph')}\`, \`${name('get_node')}\`, \`${name('get_neighbors')}\`, and \`${name('shortest_path')}\` become available.`,
        '',
        '### Authoritative Source Principle',
        '1. **Source files stay authoritative**: read the real source before editing, with or without a graph.',
        '2. **Trivial tasks**: for a single obvious file, use direct filesystem tools.',
    ].join('\n');
}
/**
 * Resolves whether the assembling session's project has a knowledge graph.
 *
 * Prefers the assembling agent's session working directory; falls back to the
 * project detected when the plugin mounted, which covers bare programmatic
 * assembly with no agent. Filesystem failures degrade to "no graph" so assembly
 * never throws.
 *
 * @param context - Assembly context supplied by the harness.
 * @param detectedGraph - Project detected at mount time, used when no agent is present.
 * @param resolver - Session-scoped project resolver.
 * @returns Whether a readable graph.json exists for the target project.
 */
function resolveHasGraph(context, detectedGraph, resolver) {
    try {
        const agentCwd = context?.agent?.session.header.cwd?.trim();
        if (agentCwd && resolver) {
            return resolver.resolve({ agentCwd }).hasGraph;
        }
    }
    catch {
        // Unreadable project state must not break prompt assembly; report no graph.
        return false;
    }
    return detectedGraph?.hasGraph === true;
}
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
export function createGraphifyPromptSection(detectedGraph, config, resolver) {
    const prefix = config?.toolPrefix || '';
    const isCompact = config?.toolMode === 'compact';
    const name = (base) => getPrefixedToolName(base, prefix);
    return {
        name: 'graphify:guidance',
        order: GRAPHIFY_SECTION_ORDER,
        text: (context) => resolveHasGraph(context, detectedGraph, resolver)
            ? buildGraphPresentText(name, isCompact)
            : buildGraphMissingText(name),
    };
}
/**
 * Warns when a harness build places first-party sections outside the window the
 * Graphify section relies on. Never throws: placement is advisory, and a
 * mismatched harness must still boot.
 *
 * @param ctx - DSH context owning the system prompt registry.
 * @param logger - Optional scoped logger.
 */
function warnOnSectionOrderDrift(ctx, logger) {
    const getSectionOrder = ctx.systemPrompt?.getSectionOrder;
    if (typeof getSectionOrder !== 'function' || logger === undefined) {
        return;
    }
    try {
        const personaOrder = getSectionOrder('DEPLOYMENT_PERSONA_PREFIX');
        const planOrder = getSectionOrder('PLAN_POLICY');
        if (typeof personaOrder === 'number' && GRAPHIFY_SECTION_ORDER <= personaOrder) {
            logger.warn(`graphify:guidance order ${GRAPHIFY_SECTION_ORDER} does not follow DEPLOYMENT_PERSONA_PREFIX (${personaOrder}); guidance may render before the deployment persona.`);
        }
        if (typeof planOrder === 'number' && GRAPHIFY_SECTION_ORDER >= planOrder) {
            logger.warn(`graphify:guidance order ${GRAPHIFY_SECTION_ORDER} does not precede PLAN_POLICY (${planOrder}); guidance may render after plan policy.`);
        }
    }
    catch {
        // Order lookup is advisory; a harness that throws here still gets the section.
    }
}
/**
 * Registers the Graphify prompt section on ctx.systemPrompt if available.
 *
 * @param ctx - DSH context owning the system prompt registry.
 * @param detectedGraph - Project detected at mount time, used for bare assembly.
 * @param config - Plugin configuration providing tool prefix and surface mode.
 * @param resolver - Session-scoped project resolver.
 * @returns The registration disposer, or a no-op when the registry is absent.
 */
export function registerGraphifyPrompt(ctx, detectedGraph, config, resolver) {
    if (!ctx.systemPrompt || typeof ctx.systemPrompt.section !== 'function') {
        return () => { };
    }
    const logger = typeof ctx.logger === 'function' ? ctx.logger('graphify') : undefined;
    warnOnSectionOrderDrift(ctx, logger);
    const section = createGraphifyPromptSection(detectedGraph, config, resolver);
    return ctx.systemPrompt.section(section);
}
