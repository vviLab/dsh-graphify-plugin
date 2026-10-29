import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { terminateChildProcess } from './server-process.ts'

/** Structural face of DSH's job registry; the plugin declares no dependency on it. */
export interface JobHandleLike {
  readonly id: string
  append(text: string, options?: { channel?: 'stdout' | 'stderr' | 'log'; gapBefore?: true }): void
  updateProgress(line: string): void
}

export interface JobOutcomeLike {
  status: 'completed' | 'killed' | 'failed'
  detail?: string
  result?: string
}

export interface JobSpecLike {
  kind: string
  label: string
  owner?: string
  run(job: JobHandleLike): {
    cancel(reason?: string): void
    done: Promise<JobOutcomeLike>
  }
}

export interface JobRegistryLike {
  start(spec: JobSpecLike): unknown
  list?(caller?: string): readonly JobViewLike[]
}

/** Projection fields this plugin reads; the registry supplies the rest. */
export interface JobViewLike {
  readonly id: string
  readonly kind: string
  readonly label: string
  readonly status: string
  readonly startedAt?: number
  readonly progress?: string
}

/** One category tally of the pre-build scan. */
export interface SourceInventory {
  readonly code: number
  readonly docs: number
  readonly papers: number
  readonly images: number
  /** Files that force semantic extraction, i.e. docs + papers + images. */
  readonly semantic: number
  readonly scanned: number
  readonly truncated: boolean
}

const CODE_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.go', '.h', '.hpp', '.java', '.js', '.jsx', '.kt', '.kts', '.lua',
  '.m', '.mm', '.php', '.py', '.rb', '.rs', '.scala', '.sh', '.sol', '.swift', '.ts', '.tsx', '.vue',
  '.svelte', '.bash', '.zsh', '.ps1', '.sql', '.proto', '.graphql',
])
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.txt', '.adoc', '.org', '.html', '.htm', '.ipynb'])
const PAPER_EXTENSIONS = new Set(['.pdf', '.tex', '.bib'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tiff'])

/** Directory names Graphify itself does not index; skipping them keeps the estimate honest. */
const SKIPPED_DIRECTORIES = new Set([
  '.git', '.hg', '.svn', '.venv', 'venv', 'node_modules', 'graphify-out', '__pycache__', '.mypy_cache',
  '.pytest_cache', '.ruff_cache', 'dist', 'build', 'target', '.next', '.turbo', '.pnpm-store',
])

/** Upper bound on inspected entries, so a preflight can never stall a build. */
const DEFAULT_SCAN_LIMIT = 200_000

/**
 * Counts the files a build will see, by category.
 *
 * This is an approximation of Graphify's own ignore rules: it skips the
 * directories that never carry corpus files and caps the walk, which is why the
 * command reports it as `≈`. Its purpose is to state the order of magnitude
 * before minutes are spent, not to predict the exact node count.
 *
 * @param projectRoot - directory the build targets.
 * @param limit - maximum entries inspected.
 * @returns per-category counts and whether the walk was cut short.
 */
export function scanSourceInventory(projectRoot: string, limit = DEFAULT_SCAN_LIMIT): SourceInventory {
  const counts = { code: 0, docs: 0, papers: 0, images: 0 }
  let scanned = 0
  let truncated = false
  const stack = [projectRoot]

  while (stack.length > 0) {
    const directory = stack.pop() as string
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (scanned >= limit) {
        truncated = true
        break
      }
      scanned += 1
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue
        stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      const extension = path.extname(entry.name).toLowerCase()
      if (CODE_EXTENSIONS.has(extension)) counts.code += 1
      else if (PAPER_EXTENSIONS.has(extension)) counts.papers += 1
      else if (IMAGE_EXTENSIONS.has(extension)) counts.images += 1
      else if (DOC_EXTENSIONS.has(extension)) counts.docs += 1
    }
    if (truncated) break
  }

  return {
    ...counts,
    semantic: counts.docs + counts.papers + counts.images,
    scanned,
    truncated,
  }
}

/**
 * Renders the preflight as the lines a build reports before it starts.
 *
 * @param inventory - result of {@link scanSourceInventory}.
 * @param options - whether an LLM key resolved, and which flags the build carries.
 * @returns one multi-line summary.
 */
export function describeInventory(
  inventory: SourceInventory,
  options: { hasLlmKey: boolean; flags: readonly string[] }
): string {
  const codeOnly = options.flags.includes('--code-only')
  const parts = [`≈${inventory.code} code`, `≈${inventory.docs} docs`, `≈${inventory.papers} papers`, `≈${inventory.images} images`]
  const lines = [`Scope: ${parts.join(', ')}${inventory.truncated ? ' (walk truncated)' : ''}`]

  if (codeOnly) {
    lines.push('Mode: --code-only — semantic sources are skipped, so no LLM calls and no full-corpus baseline.')
    return lines.join('\n')
  }
  if (inventory.semantic === 0) {
    lines.push('Mode: no semantic sources found; the build should stay local and fast.')
    return lines.join('\n')
  }

  // Graphify packed 1695 semantic files into 82 chunks for this workspace, so one
  // chunk is roughly twenty sources; the figure is an order-of-magnitude hint.
  const chunks = Math.max(1, Math.ceil(inventory.semantic / 20))
  lines.push(`Mode: semantic extraction — ≈${chunks} LLM chunk(s) for ${inventory.semantic} non-code file(s).`)
  lines.push(
    options.hasLlmKey
      ? 'LLM key: resolved, so semantic extraction will run and bill against that provider.'
      : 'LLM key: not configured — semantic extraction will fail per chunk unless you pass --code-only.'
  )
  return lines.join('\n')
}

/** Resolves the Host job registry when this deployment provides one. */
export function resolveJobRegistry(ctx: unknown): JobRegistryLike | null {
  const get = (ctx as { get?: (name: string) => unknown } | undefined)?.get
  if (typeof get !== 'function') return null
  try {
    const jobs = get.call(ctx, 'jobs') as JobRegistryLike | undefined
    return jobs && typeof jobs.start === 'function' ? jobs : null
  } catch {
    return null
  }
}

export interface StartBuildJobOptions {
  readonly registry: JobRegistryLike
  readonly label: string
  readonly owner?: string
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env?: NodeJS.ProcessEnv
  readonly preflight: string
  /** Runs after a zero exit code, before the job settles; its text is appended as narration. */
  readonly finalize?: (output: string) => Promise<string | undefined> | string | undefined
}

/** Bounded tail kept for the job result, matching the blocking path's budget. */
const OUTPUT_TAIL = 65_536

/**
 * Starts a Graphify build as a Host job and returns its id immediately.
 *
 * Every stdout/stderr write becomes a job chunk, so a client that renders the
 * job stream shows progress while the build runs; the last non-empty line also
 * becomes the job's live progress line. Cancelling the job terminates the child
 * with the same escalation used by the blocking path.
 *
 * @param options - resolved command, project context, and preflight narration.
 * @returns the registry-issued job id.
 */
export function startBuildJob(options: StartBuildJobOptions): string {
  const { registry, label, owner, command, args, cwd, env, preflight, finalize } = options
  const id = registry.start({
    kind: 'graphify',
    label,
    ...(owner ? { owner } : {}),
    run(job: JobHandleLike): {
      cancel(reason?: string): void
      done: Promise<JobOutcomeLike>
    } {
      job.append(`${preflight}\n\nCommand: ${command} ${args.join(' ')}\n\n`, { channel: 'log' })
      job.updateProgress('starting Graphify…')

      const child = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(env ? { env } : {}),
      })

      let output = ''
      let cancelled = false
      const capture = (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        if (output.length < OUTPUT_TAIL * 4) output = (output + text).slice(-OUTPUT_TAIL)
        return text
      }
      const narrate = (text: string, channel: 'stdout' | 'stderr') => {
        job.append(text, { channel })
        const line = text.split(/\r?\n/).reverse().find((candidate) => candidate.trim() !== '')
        if (line) job.updateProgress(line.trim().slice(0, 160))
      }

      child.stdout?.on('data', (chunk: Buffer) => narrate(capture(chunk), 'stdout'))
      child.stderr?.on('data', (chunk: Buffer) => narrate(capture(chunk), 'stderr'))

      const done = new Promise<JobOutcomeLike>((resolve) => {
        let settled = false
        const settle = (outcome: JobOutcomeLike) => {
          if (settled) return
          settled = true
          resolve(outcome)
        }
        child.once('error', (error: Error) => {
          job.append(`spawn failed: ${error.message}\n`, { channel: 'log' })
          settle({ status: 'failed', detail: error.message })
        })
        child.once('close', (code: number | null) => {
          void (async () => {
            const tail = output.trim() || 'Graphify finished without output.'
            if (cancelled) {
              settle({ status: 'killed', detail: 'cancelled', result: tail })
              return
            }
            if (code === 0) {
              let note: string | undefined
              try {
                note = await finalize?.(tail)
              } catch (error) {
                note = `Post-build bookkeeping failed: ${error instanceof Error ? error.message : String(error)}`
              }
              if (note) job.append(`\n${note}\n`, { channel: 'log' })
              settle({ status: 'completed', detail: 'exit code 0', result: note ? `${tail}\n\n${note}` : tail })
              return
            }
            settle({ status: 'failed', detail: `exit code ${code ?? 'unknown'}`, result: tail })
          })()
        })
      })

      return {
        cancel: () => {
          cancelled = true
          job.updateProgress('cancelling…')
          void terminateChildProcess(child)
        },
        done,
      }
    },
  })

  return String(id)
}

/**
 * Renders the running Graphify jobs owned by one Session.
 *
 * @param registry - Host job registry, when available.
 * @param sessionId - owning Session; omitted reads the unowned roster the registry allows.
 * @returns one line per running job, newest first.
 */
export function describeRunningJobs(registry: JobRegistryLike | null, sessionId?: string): string[] {
  if (!registry || typeof registry.list !== 'function') return []
  try {
    return registry
      .list(sessionId)
      .filter((job) => job.kind === 'graphify' && (job.status === 'running' || job.status === 'stopping'))
      .map((job) => {
        const elapsed = job.startedAt ? ` (${Math.round((Date.now() - job.startedAt) / 1000)}s)` : ''
        return `${job.id}${elapsed}: ${job.progress ?? job.status}`
      })
  } catch {
    return []
  }
}
