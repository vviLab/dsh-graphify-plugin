import type { Context } from '@deepseek-ai/cordis'
import { Config, validateConfig } from './config.ts'
import { detectGraph } from './detector.ts'
import {
  resolveGraphifyCommand,
  resolveGraphifyCliCommand,
  resolveGraphifyRuntime,
  resolveGraphifyCliRuntime,
  getRuntimeInfo,
  DEFAULT_GRAPHIFY_VERSION,
} from './server-process.ts'
import { GraphifyMcpClient } from './client.ts'
import { registerGraphifyTools, createGraphifyToolDefinitions, getPrefixedToolName } from './tools.ts'
import { registerGraphifyPrompt, createGraphifyPromptSection } from './prompt.ts'
import { registerGraphifyCommand } from './commands.ts'
import { ProjectResolver } from './project-resolver.ts'
import { checkGraphFreshness, ProjectUpdateCoalescer } from './freshness.ts'
import { collectGraphifyStatus, formatGraphifyStatus } from './status.ts'
import { getPackageVersion } from './version.ts'
import {
  describeSpawnEnvironment,
  readConfigField,
  readSecretSettings,
  resolveSpawnEnvironment,
  type CredentialLookup,
} from './spawn-env.ts'

export const name = 'dsh-graphify'
export const inject = ['tools', 'systemPrompt']
export { Config, validateConfig } from './config.ts'
export * from './types.ts'
export { detectGraph } from './detector.ts'
export { GraphifyMcpClient } from './client.ts'
export {
  createGraphifyToolDefinitions,
  registerGraphifyTools,
  getPrefixedToolName,
  isPathContained,
  validateProjectPathAccess,
} from './tools.ts'
export { createGraphifyPromptSection, registerGraphifyPrompt, GRAPHIFY_SECTION_ORDER } from './prompt.ts'
export { registerGraphifyCommand } from './commands.ts'
export {
  resolveGraphifyCommand,
  resolveGraphifyCliCommand,
  resolveGraphifyRuntime,
  resolveGraphifyCliRuntime,
  getRuntimeInfo,
  DEFAULT_GRAPHIFY_VERSION,
} from './server-process.ts'
export { ProjectResolver } from './project-resolver.ts'
export {
  checkGraphFreshness,
  ProjectUpdateCoalescer,
  writeGraphifyIndexMetadata,
  readGraphifyIndexMetadata,
  INDEX_METADATA_FILENAME,
} from './freshness.ts'
export { collectGraphifyStatus, formatGraphifyStatus } from './status.ts'
export { toLosslessJson } from './lossless-json.ts'
export { getPackageVersion } from './version.ts'
export {
  BACKEND_API_KEY_ENV,
  describeSpawnEnvironment,
  GRAPHIFY_BACKENDS,
  inferBackendFromEnvName,
  readSecretSettings,
  resolveSpawnEnvironment,
} from './spawn-env.ts'
export type {
  ApiKeySource,
  CredentialLookup,
  GraphifyBackend,
  GraphifyBackendSetting,
  GraphifySecretSettings,
  SpawnEnvironmentResolution,
} from './spawn-env.ts'

/** Fields DSH hands a plugin as live accessors rather than plain values. */
const VOLATILE_CONFIG_FIELDS = ['apiKey', 'apiKeyEnv', 'backend'] as const

/**
 * Resolves the plugin config for the static half of the entry.
 *
 * Volatile fields are read-only references in both directions: DSH hands them
 * in that way, and the schema returns them that way. The static config needs
 * plain values, so they are unwrapped before and after schema resolution; the
 * live references stay reachable through the raw `config` object, and
 * `readSecretSettings` re-reads them per invocation.
 */
function resolveConfig(config?: Config): Config {
  const raw = (config ?? {}) as unknown as Record<string, unknown>
  const input: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    const value = readConfigField(raw, key)
    if (value !== undefined) input[key] = value
  }

  const resolved = Config(input as unknown as Config) as unknown as Record<string, unknown>
  const plain: Record<string, unknown> = { ...resolved }
  for (const key of VOLATILE_CONFIG_FIELDS) {
    const value = readConfigField(resolved, key)
    if (value !== undefined) plain[key] = value
    else delete plain[key]
  }
  return plain as unknown as Config
}

/** Reads the credential service when this harness build exposes one. */
function credentialsLookup(ctx: Context): CredentialLookup | null {
  const get = (ctx as unknown as { get?: (name: string) => unknown }).get
  if (typeof get !== 'function') return null
  const credentials = get.call(ctx, 'credentials') as CredentialLookup | undefined
  return credentials && typeof credentials.resolve === 'function' ? credentials : null
}

/**
 * DeepSeek Harness Graphify Plugin.
 *
 * Integrates Graphify's knowledge graph intelligence, prompt decision policy,
 * session-scoped project resolution, graph freshness monitoring, doctor status,
 * and /graphify slash commands into the DeepSeek Harness runtime.
 */
export function apply(ctx: Context, config?: Config): void {
  const cfg = resolveConfig(config)
  validateConfig(cfg)
  const logger = typeof ctx.logger === 'function' ? ctx.logger('graphify') : undefined

  const resolver = new ProjectResolver(cfg)
  const initialProject = resolver.resolve()
  const workingDir = initialProject.projectRoot

  // Re-read per invocation so a key edited in the settings form reaches the
  // next build without remounting the entry.
  const resolveSpawnEnvironmentSource = () =>
    resolveSpawnEnvironment({
      settings: readSecretSettings(config),
      credentials: credentialsLookup(ctx),
    })
  const describeLlm = async () => describeSpawnEnvironment(await resolveSpawnEnvironmentSource())

  const client = new GraphifyMcpClient({
    resolveRuntime: () => resolveGraphifyRuntime(cfg, initialProject.graphJsonPath || undefined),
    cwd: workingDir,
    timeoutMs: cfg.timeoutMs,
    reconnect: cfg.reconnect,
    logger,
  })

  ctx.effect(() => {
    logger?.debug?.(`[dsh-graphify] Mounting plugin with toolMode: ${cfg.toolMode}, freshness: ${cfg.freshness.mode}`)

    // The mount-time project is only a fallback for agentless assembly; each
    // assembly resolves the calling session's own project through the resolver.
    const unregisterPrompt = cfg.enablePromptSection
      ? registerGraphifyPrompt(ctx, initialProject, cfg, resolver)
      : () => {}

    const unregisterTools = registerGraphifyTools(ctx, client, cfg, resolver, { describeLlm })

    return async () => {
      try {
        unregisterPrompt()
      } catch {
        // Ignore unregister errors
      }
      try {
        unregisterTools()
      } catch {
        // Ignore unregister errors
      }
      try {
        resolver.invalidate()
        await client.dispose()
      } catch {
        // Ignore disposal errors
      }
    }
  })

  ctx.inject(['commands'], (cmdCtx) => {
    cmdCtx.effect(() => {
      const unregisterCommand = registerGraphifyCommand(cmdCtx, cfg, workingDir, resolveSpawnEnvironmentSource)
      return () => {
        try {
          unregisterCommand()
        } catch {
          // Ignore
        }
      }
    })
  })
}
