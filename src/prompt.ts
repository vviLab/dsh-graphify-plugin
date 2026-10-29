import type { Context } from '@deepseek-ai/cordis'
import type { PromptAssemblyContext, PromptSection, DetectedGraph, ResolvedProject } from './types.ts'
import type { Config } from './config.ts'
import { getPrefixedToolName } from './tools.ts'
import { ProjectResolver } from './project-resolver.ts'

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
export const GRAPHIFY_SECTION_ORDER = 3100

/** Harness section-order slot that owns third-party tool guidance. */
const GRAPHIFY_SECTION_SLOT = 'MCP_SERVERS'

/** One decision-policy bullet; `scope: 'full'` bullets are omitted in compact mode. */
interface DecisionEntry {
  /** Tool-surface modes that render this bullet. */
  readonly scope: 'all' | 'full'
  /** Renders the bullet with the configured tool-name prefix applied. */
  readonly render: (name: (base: string) => string) => string
}

const DECISION_ENTRIES: readonly DecisionEntry[] = [
  {
    scope: 'all',
    render: (name) =>
      `- Architecture and concept discovery: use \`${name('query_graph')}\`; callers, callees, dependencies: \`${name('get_neighbors')}\`; call path between modules: \`${name('shortest_path')}\`.`,
  },
  {
    scope: 'all',
    render: (name) =>
      `- Exact symbol or interface details: use \`${name('get_node')}\` with a label or ID.`,
  },
  {
    scope: 'all',
    render: (name) =>
      `- Graph health, freshness, git sync: \`${name('graphify_status')}\`; pre-built reports and audits: \`${name('graphify_project_resource')}\` (\`resource: report|wiki|stats\`).`,
  },
  {
    scope: 'full',
    render: (name) =>
      `- Hub abstractions: \`${name('god_nodes')}\`; cluster and module boundaries: \`${name('get_community')}\`; PR blast radius: \`${name('list_prs')}\` or \`${name('get_pr_impact')}\`.`,
  },
  {
    scope: 'full',
    render: (name) =>
      `- Capability discovery and escape hatches: \`${name('graphify_capabilities')}\` then \`${name('graphify_call')}\`.`,
  },
]

const SOURCE_PRINCIPLE = [
  '### Authoritative Source Principle',
  '1. **Navigation first, source files authoritative**: use Graphify to locate files, then read the real source for implementation details.',
  '2. **Never edit blind**: do not modify code based only on a graph description.',
  '3. **Stop querying early**: once you have enough evidence, inspect or edit the files instead of issuing more graph queries.',
  '4. **Trivial tasks**: for a single obvious file, use direct filesystem tools.',
]

/**
 * Builds the guidance text for a session whose project has a knowledge graph.
 *
 * @param name - Resolves a base tool name to its registered, prefixed name.
 * @param isCompact - Whether the compact tool surface is registered.
 * @returns The rendered section text.
 */
function buildGraphPresentText(name: (base: string) => string, isCompact: boolean): string {
  const decisions = DECISION_ENTRIES.filter((entry) => entry.scope === 'all' || !isCompact).map((entry) =>
    entry.render(name)
  )

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
  ].join('\n')
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
function buildGraphMissingText(name: (base: string) => string): string {
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
  ].join('\n')
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
function resolveHasGraph(
  context: PromptAssemblyContext | undefined,
  detectedGraph: DetectedGraph | ResolvedProject | null | undefined,
  resolver: ProjectResolver | undefined
): boolean {
  try {
    const agentCwd = context?.agent?.session.header.cwd?.trim()
    if (agentCwd && resolver) {
      return resolver.resolve({ agentCwd }).hasGraph
    }
  } catch {
    // Unreadable project state must not break prompt assembly; report no graph.
    return false
  }

  return detectedGraph?.hasGraph === true
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
 * @param order - Resolved placement order; defaults to {@link GRAPHIFY_SECTION_ORDER}.
 * @returns The prompt section registration.
 */
export function createGraphifyPromptSection(
  detectedGraph?: DetectedGraph | ResolvedProject | null,
  config?: Config,
  resolver?: ProjectResolver,
  order: number = GRAPHIFY_SECTION_ORDER
): PromptSection {
  const prefix = config?.toolPrefix || ''
  const isCompact = config?.toolMode === 'compact'
  const name = (base: string) => getPrefixedToolName(base, prefix)

  return {
    name: 'graphify:guidance',
    order,
    text: (context?: PromptAssemblyContext) =>
      resolveHasGraph(context, detectedGraph, resolver)
        ? buildGraphPresentText(name, isCompact)
        : buildGraphMissingText(name),
  }
}

/**
 * Resolves the placement order from the harness' own section-order table.
 *
 * @param ctx - DSH context owning the system prompt registry.
 * @returns The harness' `MCP_SERVERS` order, or {@link GRAPHIFY_SECTION_ORDER} when unpublished.
 */
function resolveSectionOrder(ctx: Context): number {
  const getSectionOrder = ctx.systemPrompt?.getSectionOrder
  if (typeof getSectionOrder !== 'function') {
    return GRAPHIFY_SECTION_ORDER
  }

  try {
    const order = getSectionOrder(GRAPHIFY_SECTION_SLOT)
    return typeof order === 'number' && Number.isFinite(order) ? order : GRAPHIFY_SECTION_ORDER
  } catch {
    // Order lookup is advisory; a harness that throws here still gets the section.
    return GRAPHIFY_SECTION_ORDER
  }
}

/**
 * Warns when a harness build places the external tool-server band outside the
 * window the Graphify section relies on. Never throws: placement is advisory, and
 * a mismatched harness must still boot.
 *
 * @param order - The order actually used by the section.
 * @param ctx - DSH context owning the system prompt registry.
 * @param logger - Optional scoped logger.
 */
function warnOnSectionOrderDrift(
  order: number,
  ctx: Context,
  logger: { warn: (message: string) => void } | undefined
): void {
  const getSectionOrder = ctx.systemPrompt?.getSectionOrder
  if (typeof getSectionOrder !== 'function' || logger === undefined) {
    return
  }

  try {
    const nativeToolEnd = getSectionOrder('TOOL_COMPUTER_USE')
    const sdkToolStart = getSectionOrder('TOOLS_SDK')
    if (typeof nativeToolEnd === 'number' && order <= nativeToolEnd) {
      logger.warn(
        `graphify:guidance order ${order} does not follow TOOL_COMPUTER_USE (${nativeToolEnd}); guidance would render inside native tool guidance.`
      )
    }
    if (typeof sdkToolStart === 'number' && order >= sdkToolStart) {
      logger.warn(
        `graphify:guidance order ${order} does not precede TOOLS_SDK (${sdkToolStart}); guidance would render after SDK tool conventions.`
      )
    }
    if (typeof getSectionOrder(GRAPHIFY_SECTION_SLOT) !== 'number') {
      logger.warn(
        `graphify:guidance order fell back to ${GRAPHIFY_SECTION_ORDER}; harness publishes no ${GRAPHIFY_SECTION_SLOT} slot.`
      )
    }
  } catch {
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
export function registerGraphifyPrompt(
  ctx: Context,
  detectedGraph?: DetectedGraph | ResolvedProject | null,
  config?: Config,
  resolver?: ProjectResolver
): () => void {
  if (!ctx.systemPrompt || typeof ctx.systemPrompt.section !== 'function') {
    return () => {}
  }

  const logger = typeof ctx.logger === 'function' ? ctx.logger('graphify') : undefined
  const order = resolveSectionOrder(ctx)
  warnOnSectionOrderDrift(order, ctx, logger)
  const section = createGraphifyPromptSection(detectedGraph, config, resolver, order)
  return ctx.systemPrompt.section(section)
}
