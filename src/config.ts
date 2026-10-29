import Schema from '@deepseek-ai/schemastery'
import type { GraphifyBackendSetting } from './spawn-env.ts'
import { GRAPHIFY_BACKENDS, readConfigField } from './spawn-env.ts'

/**
 * Configuration for the DeepSeek Harness Graphify Plugin.
 */
export interface Config {
  /**
   * MCP server executable. Set this with `args` to bypass automatic Graphify
   * runtime discovery.
   */
  command: string

  /**
   * Arguments passed to a configured MCP server executable.
   */
  args: string[]

  /**
   * Optional Graphify package version used when automatic discovery falls back
   * to uv. Pin a release for reproducible deployments; omit for uv's latest
   * compatible release.
   */
  graphifyVersion?: string

  /** Optional Graphify CLI executable for the `/graphify` command. */
  cliCommand?: string

  /** Arguments preceding Graphify's build or update operation. */
  cliArgs: string[]

  /**
   * Optional explicit path to graph.json.
   * If omitted, the plugin automatically detects graphify-out/graph.json in the workspace.
   */
  graphPath?: string

  /**
   * Automatically detect Graphify graphs in the workspace/cwd and parent directories.
   * Defaults to true.
   */
  autoDetect: boolean

  /**
   * Register a system prompt guidance section instructing the model on Graphify usage.
   * Defaults to true.
   */
  enablePromptSection: boolean

  /**
   * Per-tool-call execution timeout in milliseconds.
   * Defaults to 60000 ms (1 minute).
   */
  timeoutMs: number

  /**
   * Optional prefix for registered tool names (e.g. 'graphify_' or '').
   * Defaults to '' (keeps native tool names like query_graph, get_node).
   */
  toolPrefix: string

  /**
   * Tool surface mode.
   * - 'full': Registers the complete Graphify tool surface (all 10 native tools, doctor, and escape hatches).
   * - 'compact': Registers a focused 6-tool surface tailored for smaller local models (20B-30B class).
   * Defaults to 'full'.
   */
  toolMode: 'compact' | 'full'

  /**
   * Freshness monitoring and auto-update configuration.
   */
  freshness: {
    /**
     * Freshness evaluation mode:
     * - 'off': Never check or warn about freshness.
     * - 'warn': Warn when the graph is likely stale without rebuilding.
     * - 'auto': Automatically trigger incremental graph updates before queries when stale.
     * Defaults to 'warn'.
     */
    mode: 'off' | 'warn' | 'auto'
    /** Maximum duration in milliseconds to await an incremental graph update. */
    updateTimeoutMs: number
  }

  /**
   * Connection resilience and reconnection policy for Graphify MCP subprocess.
   */
  reconnect: {
    /** Enable automatic reconnection after lost connection (default true). */
    enabled: boolean
    /** Initial reconnect delay in milliseconds (default 500). */
    initialDelayMs: number
    /** Maximum delay between reconnect attempts in milliseconds (default 30000). */
    maxDelayMs: number
    /** Maximum consecutive reconnect attempts before giving up (default 10). */
    maxAttempts: number
  }

  /**
   * Working directory for the Graphify subprocess.
   * Defaults to the active project root or process.cwd().
   */
  cwd?: string

  /**
   * Optional literal API key for Graphify's semantic extraction pass.
   *
   * Write-only: the DSH settings form masks the value and never sends a stored
   * key back to the browser. Leave it empty to resolve the key through the DSH
   * credential store instead (see `apiKeyEnv`).
   */
  apiKey?: string

  /**
   * Credential reference naming the API key for semantic extraction.
   *
   * Resolved through the DSH credential store first and the launching
   * environment second, then exported to Graphify under the variable its
   * backend reads. Defaults to `DEEPSEEK_API_KEY`.
   */
  apiKeyEnv?: string

  /**
   * Graphify LLM backend used for semantic extraction.
   *
   * `auto` infers the backend from `apiKeyEnv`. Choose one explicitly when the
   * key must be exported under a different variable. Only `gemini`, `kimi`,
   * `claude`, and `openai` accept image inputs; a `deepseek` key leaves image
   * files to the next backend that supports vision.
   */
  backend?: GraphifyBackendSetting

  /**
   * Allow model-invoked Graphify tools to operate on projects outside the active DSH session workspace.
   * Defaults to false for security in marketplace deployments.
   */
  allowExternalProjects: boolean
}

/**
 * Plugin configuration schema.
 *
 * The credential fields are `volatile` so DSH projects them into the plugin
 * settings form and applies edits live, and `role('secret')` so the stored key
 * is redacted before it reaches a browser. Schemastery types a volatile field
 * as an accessor object, while the plugin reads a plain resolved value, so the
 * exported type is asserted to the plain `Config` interface and `apply()` reads
 * the raw accessors through `readSecretSettings`. DSH accepts the same
 * asserted shape (`dsh-web-search-deepseek` declares its key the same way).
 */
export const Config = Schema.object({
  command: Schema.string().default('auto').description('MCP server executable, or auto to discover Graphify'),
  args: Schema.array(Schema.string()).default([]).description('Arguments for a configured MCP server executable'),
  graphifyVersion: Schema.string().description('Pinned graphifyy version for uv fallback, for example 0.9.57'),
  cliCommand: Schema.string().description('Graphify CLI executable for the direct command'),
  cliArgs: Schema.array(Schema.string()).default([]).description('Arguments preceding the direct Graphify operation'),
  graphPath: Schema.string().description('Explicit absolute or relative path to graph.json'),
  autoDetect: Schema.boolean().default(true).description('Automatically detect graphify-out/graph.json in workspace'),
  enablePromptSection: Schema.boolean().default(true).description('Register system prompt guidance for Graphify tools'),
  timeoutMs: Schema.number().default(60000).description('Per-tool-call timeout in milliseconds'),
  toolPrefix: Schema.string().default('').description('Optional prefix for registered tool names'),
  toolMode: Schema.union(['compact', 'full']).default('full').description('Tool surface mode: compact for local models, full for complete suite'),
  freshness: Schema.object({
    mode: Schema.union(['off', 'warn', 'auto']).default('warn').description('Graph freshness mode (off, warn, auto)'),
    updateTimeoutMs: Schema.number().default(120000).description('Max wait time for incremental graph update'),
  }).default({ mode: 'warn', updateTimeoutMs: 120000 }).description('Graph freshness monitoring and auto-update options'),
  reconnect: Schema.object({
    enabled: Schema.boolean().default(true).description('Enable automatic reconnection on unexpected exit'),
    initialDelayMs: Schema.number().default(500).description('Initial reconnect backoff delay in milliseconds'),
    maxDelayMs: Schema.number().default(30000).description('Maximum reconnect delay in milliseconds'),
    maxAttempts: Schema.number().default(10).description('Maximum consecutive reconnect attempts'),
  }).default({ enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 }).description('Connection resilience options'),
  cwd: Schema.string().description('Explicit working directory for Graphify subprocess'),
  apiKey: Schema.string()
    .role('secret')
    .volatile()
    .description('Optional literal LLM API key for semantic extraction (documents, papers, images). Write-only; DSH masks it'),
  apiKeyEnv: Schema.string()
    .role('credential-ref')
    .default('DEEPSEEK_API_KEY')
    .volatile()
    .description('Credential reference resolved through the DSH credential store, then the launching environment'),
  backend: Schema.union(['auto', 'gemini', 'kimi', 'claude', 'openai', 'deepseek', 'ollama'])
    .default('auto')
    .volatile()
    .description('Graphify LLM backend for semantic extraction; auto infers it from apiKeyEnv'),
  allowExternalProjects: Schema.boolean().default(false).description('Allow model-invoked Graphify tools to operate on projects outside the active DSH session workspace'),
}) as unknown as Schema<Config>

/**
 * Validates a resolved configuration object, throwing actionable errors if
 * any parameters are invalid or out of bounds.
 */
export function validateConfig(config: Config): void {
  if (config.allowExternalProjects !== undefined && typeof config.allowExternalProjects !== 'boolean') {
    throw new Error(`Invalid dsh-graphify configuration: allowExternalProjects must be a boolean, got ${config.allowExternalProjects}.`)
  }

  if (typeof config.timeoutMs !== 'number' || config.timeoutMs <= 0 || !Number.isFinite(config.timeoutMs)) {
    throw new Error(`Invalid dsh-graphify configuration: timeoutMs must be a positive number, got ${config.timeoutMs}.`)
  }

  if (config.toolMode !== 'compact' && config.toolMode !== 'full') {
    throw new Error(`Invalid dsh-graphify configuration: toolMode must be 'compact' or 'full', got '${config.toolMode}'.`)
  }

  if (config.freshness) {
    if (config.freshness.mode !== 'off' && config.freshness.mode !== 'warn' && config.freshness.mode !== 'auto') {
      throw new Error(`Invalid dsh-graphify configuration: freshness.mode must be 'off', 'warn', or 'auto', got '${config.freshness.mode}'.`)
    }
    if (typeof config.freshness.updateTimeoutMs !== 'number' || config.freshness.updateTimeoutMs <= 0 || !Number.isFinite(config.freshness.updateTimeoutMs)) {
      throw new Error(`Invalid dsh-graphify configuration: freshness.updateTimeoutMs must be a positive number, got ${config.freshness.updateTimeoutMs}.`)
    }
  }

  if (config.reconnect) {
    if (typeof config.reconnect.initialDelayMs !== 'number' || config.reconnect.initialDelayMs < 0 || !Number.isFinite(config.reconnect.initialDelayMs)) {
      throw new Error(`Invalid dsh-graphify configuration: reconnect.initialDelayMs must be non-negative, got ${config.reconnect.initialDelayMs}.`)
    }
    if (typeof config.reconnect.maxDelayMs !== 'number' || config.reconnect.maxDelayMs < 0 || !Number.isFinite(config.reconnect.maxDelayMs)) {
      throw new Error(`Invalid dsh-graphify configuration: reconnect.maxDelayMs must be non-negative, got ${config.reconnect.maxDelayMs}.`)
    }
    if (config.reconnect.maxDelayMs < config.reconnect.initialDelayMs) {
      throw new Error(`Invalid dsh-graphify configuration: reconnect.maxDelayMs (${config.reconnect.maxDelayMs}) must be >= reconnect.initialDelayMs (${config.reconnect.initialDelayMs}).`)
    }
    if (typeof config.reconnect.maxAttempts !== 'number' || !Number.isInteger(config.reconnect.maxAttempts) || config.reconnect.maxAttempts < 0) {
      throw new Error(`Invalid dsh-graphify configuration: reconnect.maxAttempts must be a non-negative integer, got ${config.reconnect.maxAttempts}.`)
    }
  }

  // Volatile fields may arrive as live references; validation reads their current value.
  const backend = readConfigField(config, 'backend')
  if (backend !== undefined && backend !== 'auto' && !(GRAPHIFY_BACKENDS as readonly string[]).includes(backend as string)) {
    throw new Error(`Invalid dsh-graphify configuration: backend must be 'auto' or one of ${GRAPHIFY_BACKENDS.join(', ')}, got '${String(backend)}'.`)
  }

  const apiKey = readConfigField(config, 'apiKey')
  if (apiKey !== undefined && typeof apiKey !== 'string') {
    throw new Error('Invalid dsh-graphify configuration: apiKey must be a string.')
  }

  const apiKeyEnv = readConfigField(config, 'apiKeyEnv')
  if (apiKeyEnv !== undefined && apiKeyEnv !== '' && (typeof apiKeyEnv !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv))) {
    throw new Error(`Invalid dsh-graphify configuration: apiKeyEnv must be an environment-variable name, got '${String(apiKeyEnv)}'.`)
  }
}
