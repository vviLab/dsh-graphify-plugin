import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Config } from '../src/config.ts'
import { ProjectResolver } from '../src/project-resolver.ts'
import {
  createGraphifyPromptSection,
  registerGraphifyPrompt,
  GRAPHIFY_SECTION_ORDER,
} from '../src/prompt.ts'
import type { DetectedGraph, PromptAssemblyContext, PromptSection } from '../src/types.ts'

const createdDirs: string[] = []

/** Creates a throwaway project directory, optionally containing a graph. */
function makeProject(withGraph: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-prompt-'))
  createdDirs.push(dir)
  if (withGraph) {
    const outDir = path.join(dir, 'graphify-out')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'graph.json'), JSON.stringify({ nodes: [], links: [] }))
  }
  return dir
}

/** Builds the assembly context an agent-scoped assembly supplies. */
function assemblyFor(agentCwd: string): PromptAssemblyContext {
  return { agent: { session: { header: { cwd: agentCwd } } } }
}

/** Renders a section's text for one assembly context. */
function render(section: PromptSection, context: PromptAssemblyContext = {}): string {
  const { text } = section
  return typeof text === 'function' ? text(context) : text
}

/** Builds a resolver whose config points at the given project. */
function resolverFor(projectRoot: string): ProjectResolver {
  return new ProjectResolver(Config({ cwd: projectRoot }))
}

describe('graphify prompt section', () => {
  it('contributes one section at the documented order', () => {
    const section = createGraphifyPromptSection(null, Config())
    assert.equal(section.name, 'graphify:guidance')
    assert.equal(section.order, GRAPHIFY_SECTION_ORDER)
    assert.equal(GRAPHIFY_SECTION_ORDER, 250)
  })

  it('describes an available graph and its decision policy', () => {
    const projectRoot = makeProject(true)
    const config = Config({ cwd: projectRoot, toolMode: 'full' })
    const text = render(createGraphifyPromptSection(null, config, resolverFor(projectRoot)), assemblyFor(projectRoot))

    assert.ok(text.startsWith('## Graphify Knowledge Graph & Decision Policy'))
    assert.match(text, /has a local Graphify knowledge graph/)
    assert.match(text, /### Decision Policy: When to use Graphify/)
    assert.match(text, /### Authoritative Source Principle/)
    assert.match(text, /`query_graph`/)
    assert.match(text, /`graphify_status`/)
    assert.doesNotMatch(text, /\/graphify build/, 'present-graph text must not ask the model to build a graph')
  })

  it('reports a missing graph instead of claiming access, and says how to fix it', () => {
    const projectRoot = makeProject(false)
    const config = Config({ cwd: projectRoot })
    const text = render(createGraphifyPromptSection(null, config, resolverFor(projectRoot)), assemblyFor(projectRoot))

    assert.doesNotMatch(text, /provides access to a local Graphify/)
    assert.doesNotMatch(text, /has a local Graphify knowledge graph/)
    assert.match(text, /No Graphify knowledge graph is present/)
    assert.match(text, /\/graphify build/)
    assert.match(text, /### Authoritative Source Principle/)
  })

  it('resolves each assembling session independently', () => {
    const withGraph = makeProject(true)
    const withoutGraph = makeProject(false)
    const config = Config({ cwd: withoutGraph })
    const section = createGraphifyPromptSection(null, config, resolverFor(withoutGraph))

    const presentText = render(section, assemblyFor(withGraph))
    const missingText = render(section, assemblyFor(withoutGraph))

    assert.match(presentText, /has a local Graphify knowledge graph/)
    assert.match(missingText, /No Graphify knowledge graph is present/)
    assert.notEqual(presentText, missingText)
  })

  it('prefers the assembling agent over the mount-time project', () => {
    const withGraph = makeProject(true)
    const detectedGraph = { hasGraph: false } as DetectedGraph
    const section = createGraphifyPromptSection(detectedGraph, Config({ cwd: withGraph }), resolverFor(withGraph))

    assert.match(render(section, assemblyFor(withGraph)), /has a local Graphify knowledge graph/)
  })

  it('falls back to the mount-time project when no agent is present', () => {
    const detectedGraph = { hasGraph: true } as DetectedGraph
    const text = render(createGraphifyPromptSection(detectedGraph, Config()), {})
    assert.match(text, /has a local Graphify knowledge graph/)

    const noGraphText = render(createGraphifyPromptSection(null, Config()), {})
    assert.match(noGraphText, /No Graphify knowledge graph is present/)
  })

  it('degrades to the missing-graph text when project resolution throws', () => {
    const throwingResolver = {
      resolve() {
        throw new Error('filesystem unavailable')
      },
    } as unknown as ProjectResolver
    const withGraph = makeProject(true)
    const detectedGraph = { hasGraph: true } as DetectedGraph
    const section = createGraphifyPromptSection(detectedGraph, Config({ cwd: withGraph }), throwingResolver)

    const text = render(section, assemblyFor(withGraph))
    assert.match(text, /No Graphify knowledge graph is present/)
  })

  it('omits specialist tools in compact mode', () => {
    const projectRoot = makeProject(true)
    const compact = Config({ cwd: projectRoot, toolMode: 'compact' })
    const full = Config({ cwd: projectRoot, toolMode: 'full' })
    const compactText = render(createGraphifyPromptSection(null, compact, resolverFor(projectRoot)), assemblyFor(projectRoot))
    const fullText = render(createGraphifyPromptSection(null, full, resolverFor(projectRoot)), assemblyFor(projectRoot))

    for (const tool of ['god_nodes', 'get_community', 'list_prs', 'get_pr_impact', 'graphify_capabilities', 'graphify_call']) {
      assert.ok(fullText.includes(tool), `full mode must name ${tool}`)
      assert.ok(!compactText.includes(tool), `compact mode must not name ${tool}`)
    }
    for (const tool of ['query_graph', 'get_node', 'get_neighbors', 'shortest_path', 'graphify_status']) {
      assert.ok(compactText.includes(tool), `compact mode must keep ${tool}`)
    }
  })

  it('applies the configured tool prefix to every rendered tool name', () => {
    const projectRoot = makeProject(true)
    const config = Config({ cwd: projectRoot, toolPrefix: 'kg_' })
    const text = render(createGraphifyPromptSection(null, config, resolverFor(projectRoot)), assemblyFor(projectRoot))

    assert.ok(text.includes('`kg_query_graph`'))
    assert.ok(!text.includes('`query_graph`'))
  })

  it('stays within the prompt budget for every state', () => {
    const presentFull = makeProject(true)
    const presentCompact = makeProject(true)
    const absent = makeProject(false)

    const fullText = render(
      createGraphifyPromptSection(null, Config({ cwd: presentFull }), resolverFor(presentFull)),
      assemblyFor(presentFull)
    )
    const compactText = render(
      createGraphifyPromptSection(null, Config({ cwd: presentCompact, toolMode: 'compact' }), resolverFor(presentCompact)),
      assemblyFor(presentCompact)
    )
    const missingText = render(
      createGraphifyPromptSection(null, Config({ cwd: absent }), resolverFor(absent)),
      assemblyFor(absent)
    )

    assert.ok(fullText.length <= 1600, `full guidance is ${fullText.length} chars, budget is 1600`)
    assert.ok(compactText.length <= 1300, `compact guidance is ${compactText.length} chars, budget is 1300`)
    assert.ok(missingText.length <= 650, `missing-graph guidance is ${missingText.length} chars, budget is 650`)
    assert.ok(compactText.length < fullText.length)
    assert.ok(missingText.length < compactText.length)
  })
})

describe('graphify prompt registration', () => {
  /** Builds a stub harness context that records section registrations. */
  function stubContext(options: { sections?: Map<string, PromptSection>; orders?: Record<string, number> } = {}) {
    const sections = options.sections ?? new Map<string, PromptSection>()
    const warnings: string[] = []
    const ctx = {
      logger: () => ({ warn: (message: string) => warnings.push(message) }),
      systemPrompt: {
        section(section: PromptSection) {
          sections.set(section.name, section)
          return () => sections.delete(section.name)
        },
        ...(options.orders ? { getSectionOrder: (name: string) => options.orders?.[name] } : {}),
      },
    } as unknown as Context
    return { ctx, sections, warnings }
  }

  it('registers and disposes the guidance section', () => {
    const { ctx, sections } = stubContext()
    const dispose = registerGraphifyPrompt(ctx, null, Config())

    assert.ok(sections.has('graphify:guidance'))
    dispose()
    assert.ok(!sections.has('graphify:guidance'))
  })

  it('does nothing when the harness has no prompt registry', () => {
    const ctx = {} as Context
    const dispose = registerGraphifyPrompt(ctx, null, Config())
    assert.equal(typeof dispose, 'function')
    assert.doesNotThrow(dispose)
  })

  it('warns when the platform places first-party sections around the intended window', () => {
    const drifted = stubContext({ orders: { DEPLOYMENT_PERSONA_PREFIX: 300, PLAN_POLICY: 100 } })
    registerGraphifyPrompt(drifted.ctx, null, Config())
    assert.equal(drifted.warnings.length, 2)

    const healthy = stubContext({ orders: { DEPLOYMENT_PERSONA_PREFIX: 0, PLAN_POLICY: 500 } })
    registerGraphifyPrompt(healthy.ctx, null, Config())
    assert.deepEqual(healthy.warnings, [])
  })

  it('registers the section even when order lookup is unavailable', () => {
    const { ctx, sections, warnings } = stubContext()
    assert.doesNotThrow(() => registerGraphifyPrompt(ctx, null, Config()))
    assert.ok(sections.has('graphify:guidance'))
    assert.deepEqual(warnings, [])
  })
})

process.on('exit', () => {
  for (const dir of createdDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // Temp cleanup is best effort; a leaked tmp dir must not fail the run.
    }
  }
})
