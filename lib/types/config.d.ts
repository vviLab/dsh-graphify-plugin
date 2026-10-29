import Schema from '@deepseek-ai/schemastery';
import type { GraphifyBackendSetting } from './spawn-env.ts';
/**
 * Configuration for the DeepSeek Harness Graphify Plugin.
 */
export interface Config {
    /**
     * MCP server executable. Set this with `args` to bypass automatic Graphify
     * runtime discovery.
     */
    command: string;
    /**
     * Arguments passed to a configured MCP server executable.
     */
    args: string[];
    /**
     * Optional Graphify package version used when automatic discovery falls back
     * to uv. Pin a release for reproducible deployments; omit for uv's latest
     * compatible release.
     */
    graphifyVersion?: string;
    /** Optional Graphify CLI executable for the `/graphify` command. */
    cliCommand?: string;
    /** Arguments preceding Graphify's build or update operation. */
    cliArgs: string[];
    /**
     * Optional explicit path to graph.json.
     * If omitted, the plugin automatically detects graphify-out/graph.json in the workspace.
     */
    graphPath?: string;
    /**
     * Automatically detect Graphify graphs in the workspace/cwd and parent directories.
     * Defaults to true.
     */
    autoDetect: boolean;
    /**
     * Register a system prompt guidance section instructing the model on Graphify usage.
     * Defaults to true.
     */
    enablePromptSection: boolean;
    /**
     * Per-tool-call execution timeout in milliseconds.
     * Defaults to 60000 ms (1 minute).
     */
    timeoutMs: number;
    /**
     * Optional prefix for registered tool names (e.g. 'graphify_' or '').
     * Defaults to '' (keeps native tool names like query_graph, get_node).
     */
    toolPrefix: string;
    /**
     * Tool surface mode.
     * - 'full': Registers the complete Graphify tool surface (all 10 native tools, doctor, and escape hatches).
     * - 'compact': Registers a focused 6-tool surface tailored for smaller local models (20B-30B class).
     * Defaults to 'full'.
     */
    toolMode: 'compact' | 'full';
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
        mode: 'off' | 'warn' | 'auto';
        /** Maximum duration in milliseconds to await an incremental graph update. */
        updateTimeoutMs: number;
    };
    /**
     * Connection resilience and reconnection policy for Graphify MCP subprocess.
     */
    reconnect: {
        /** Enable automatic reconnection after lost connection (default true). */
        enabled: boolean;
        /** Initial reconnect delay in milliseconds (default 500). */
        initialDelayMs: number;
        /** Maximum delay between reconnect attempts in milliseconds (default 30000). */
        maxDelayMs: number;
        /** Maximum consecutive reconnect attempts before giving up (default 10). */
        maxAttempts: number;
    };
    /**
     * Working directory for the Graphify subprocess.
     * Defaults to the active project root or process.cwd().
     */
    cwd?: string;
    /**
     * Optional literal API key for Graphify's semantic extraction pass.
     *
     * Write-only: the DSH settings form masks the value and never sends a stored
     * key back to the browser. Leave it empty to resolve the key through the DSH
     * credential store instead (see `apiKeyEnv`).
     */
    apiKey?: string;
    /**
     * Credential reference naming the API key for semantic extraction.
     *
     * Resolved through the DSH credential store first and the launching
     * environment second, then exported to Graphify under the variable its
     * backend reads. Defaults to `DEEPSEEK_API_KEY`.
     */
    apiKeyEnv?: string;
    /**
     * Graphify LLM backend used for semantic extraction.
     *
     * `auto` infers the backend from `apiKeyEnv`. Choose one explicitly when the
     * key must be exported under a different variable. Only `gemini`, `kimi`,
     * `claude`, and `openai` accept image inputs; a `deepseek` key leaves image
     * files to the next backend that supports vision.
     */
    backend?: GraphifyBackendSetting;
    /**
     * Allow model-invoked Graphify tools to operate on projects outside the active DSH session workspace.
     * Defaults to false for security in marketplace deployments.
     */
    allowExternalProjects: boolean;
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
export declare const Config: Schema<Config>;
/**
 * Validates a resolved configuration object, throwing actionable errors if
 * any parameters are invalid or out of bounds.
 */
export declare function validateConfig(config: Config): void;
