import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  describeInventory,
  describeRunningJobs,
  resolveJobRegistry,
  scanSourceInventory,
  startBuildJob,
  type JobHandleLike,
  type JobRegistryLike,
  type JobSpecLike,
} from '../src/progress.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const progressCli = path.join(__dirname, 'fixtures', 'fake-graphify-progress-cli.mjs')

describe('build preflight', () => {
  it('counts corpus candidates by category and skips ignored directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-inventory-'))
    fs.mkdirSync(path.join(root, 'src'))
    fs.mkdirSync(path.join(root, 'node_modules', 'left-pad'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1\n')
    fs.writeFileSync(path.join(root, 'src', 'b.py'), 'b = 1\n')
    fs.writeFileSync(path.join(root, 'README.md'), '# docs\n')
    fs.writeFileSync(path.join(root, 'paper.pdf'), '%PDF-1.4\n')
    fs.writeFileSync(path.join(root, 'diagram.png'), 'png\n')
    fs.writeFileSync(path.join(root, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1\n')

    const inventory = scanSourceInventory(root)
    assert.equal(inventory.code, 2)
    assert.equal(inventory.docs, 1)
    assert.equal(inventory.papers, 1)
    assert.equal(inventory.images, 1)
    assert.equal(inventory.semantic, 3)
    assert.equal(inventory.truncated, false)
  })

  it('reports the walk-truncated flag instead of pretending the count is exact', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-inventory-cut-'))
    for (let index = 0; index < 5; index += 1) {
      fs.writeFileSync(path.join(root, `f${index}.ts`), 'x\n')
    }
    assert.equal(scanSourceInventory(root, 2).truncated, true)
  })

  it('describes code-only, local-only, and semantic modes differently', () => {
    const inventory = { code: 100, docs: 40, papers: 0, images: 0, semantic: 40, scanned: 140, truncated: false }

    const codeOnly = describeInventory(inventory, { hasLlmKey: false, flags: ['--code-only'] })
    assert.match(codeOnly, /--code-only/)
    assert.match(codeOnly, /≈100 code/)
    assert.doesNotMatch(codeOnly, /LLM chunk/)

    const noSemantic = describeInventory({ ...inventory, docs: 0, semantic: 0 }, { hasLlmKey: true, flags: [] })
    assert.match(noSemantic, /no semantic sources/)

    const semantic = describeInventory(inventory, { hasLlmKey: true, flags: [] })
    assert.match(semantic, /≈2 LLM chunk/)
    assert.match(semantic, /resolved/)

    const missingKey = describeInventory(inventory, { hasLlmKey: false, flags: [] })
    assert.match(missingKey, /not configured/)
    assert.match(missingKey, /--code-only/)
  })
})

describe('job registry integration', () => {
  it('resolves no registry when the host provides none', () => {
    assert.equal(resolveJobRegistry({}), null)
    assert.equal(resolveJobRegistry(undefined), null)
  })

  it('resolves the host job service and lists only running Graphify jobs', () => {
    const registry: JobRegistryLike = {
      start: () => 'job-1',
      list: () => [
        { id: 'graphify-1', kind: 'graphify', label: 'build', status: 'running', startedAt: Date.now() - 4000, progress: 'chunk 3/9' },
        { id: 'graphify-2', kind: 'graphify', label: 'build', status: 'completed' },
        { id: 'bash-1', kind: 'bash', label: 'sleep', status: 'running' },
      ],
    }
    const ctx = { get: (name: string) => (name === 'jobs' ? registry : undefined) }
    assert.equal(resolveJobRegistry(ctx), registry)

    const lines = describeRunningJobs(registry, 'session-1')
    assert.equal(lines.length, 1)
    assert.match(lines[0], /graphify-1/)
    assert.match(lines[0], /chunk 3\/9/)
  })

  it('streams child output into the job ring and settles completed', async () => {
    const appended: { text: string; channel?: string }[] = []
    const progress: string[] = []
    let spec: JobSpecLike | undefined
    let observedId: string | undefined

    const registry: JobRegistryLike = {
      start(candidate) {
        spec = candidate
        return 'graphify-job-9'
      },
    }

    const id = startBuildJob({
      registry,
      label: '/graphify build /tmp/x',
      owner: 'session-1',
      command: process.execPath,
      args: [progressCli],
      cwd: os.tmpdir(),
      preflight: 'Scope: ≈12 code',
    })

    assert.equal(id, 'graphify-job-9')
    assert.equal(spec?.kind, 'graphify')
    assert.equal(spec?.owner, 'session-1')

    const job: JobHandleLike = {
      id: 'graphify-job-9',
      append(text, options) {
        appended.push({ text, ...(options?.channel ? { channel: options.channel } : {}) })
      },
      updateProgress(line) {
        progress.push(line)
      },
    }
    observedId = job.id
    const hooks = spec!.run(job)
    const outcome = await hooks.done

    assert.equal(observedId, 'graphify-job-9')
    assert.equal(outcome.status, 'completed')
    assert.match(outcome.result ?? '', /wrote graphify-out\/graph\.json/)
    assert.ok(appended.some((entry) => entry.text.includes('Scope: ≈12 code') && entry.channel === 'log'))
    assert.ok(appended.some((entry) => entry.text.includes('chunk 1/2 done') && entry.channel === 'stdout'))
    assert.ok(progress.some((line) => line.includes('wrote graphify-out')))
  })

  it('settles failed on a non-zero exit', async () => {
    let spec: JobSpecLike | undefined
    const registry: JobRegistryLike = {
      start(candidate) {
        spec = candidate
        return 'graphify-job-fail'
      },
    }
    startBuildJob({
      registry,
      label: 'build',
      command: process.execPath,
      args: ['-e', 'process.stderr.write("boom\\n"); process.exit(3)'],
      cwd: os.tmpdir(),
      preflight: 'scope',
    })
    const chunks: string[] = []
    const hooks = spec!.run({
      id: 'graphify-job-fail',
      append: (text) => chunks.push(text),
      updateProgress: () => {},
    })
    const outcome = await hooks.done
    assert.equal(outcome.status, 'failed')
    assert.match(outcome.detail ?? '', /exit code 3/)
    assert.ok(chunks.some((chunk) => chunk.includes('boom')))
  })
})
