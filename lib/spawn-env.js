/**
 * LLM credentials for Graphify's semantic extraction pass.
 *
 * Graphify splits its corpus in two: code goes through a local AST pass that
 * needs no credentials, while documents, papers, and images need an LLM. The
 * CLI therefore reads one API-key environment variable per backend and exits
 * with `no LLM API key found` when none is present (graphifyy 0.9.57,
 * `cli.py` -> `needs_llm` / `llm.detect_backend`).
 *
 * DSH never exports provider keys into the environment of a plugin subprocess:
 * a key lives in the credential store (`ctx.credentials`) behind a reference
 * such as `DEEPSEEK_API_KEY`, and resolves only when a consumer asks. This
 * module bridges the two worlds: it resolves the key through the credential
 * service first, the launching environment second, and hands the CLI a spawn
 * environment carrying the variable name Graphify expects.
 */
/** Backends in the order Graphify's own auto-detection tries them. */
export const GRAPHIFY_BACKENDS = [
    'gemini',
    'kimi',
    'claude',
    'openai',
    'deepseek',
    'ollama',
];
/** API-key variable Graphify reads for each backend. */
export const BACKEND_API_KEY_ENV = {
    gemini: 'GEMINI_API_KEY',
    kimi: 'MOONSHOT_API_KEY',
    claude: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    ollama: 'OLLAMA_API_KEY',
};
/** Backend implied by each API-key variable name. */
const ENV_NAME_BACKEND = Object.fromEntries(Object.entries(BACKEND_API_KEY_ENV).map(([backend, envName]) => [
    envName,
    backend,
]));
/**
 * Reads one config field, unwrapping DSH's volatile accessor when present.
 *
 * A volatile field travels as a frozen reference whose `get()` answers with the
 * current value; a plain value is returned unchanged. A reference that throws
 * reads as absent so a broken accessor cannot mask the schema default.
 *
 * @param source - plugin config object or a resolved config value.
 * @param key - field name to read.
 * @returns the field's current plain value, or undefined when absent.
 */
export function readConfigField(source, key) {
    if (typeof source !== 'object' || source === null)
        return undefined;
    const value = Reflect.get(source, key);
    if (typeof value === 'object' && value !== null && typeof Reflect.get(value, 'get') === 'function') {
        try {
            return Reflect.get(value, 'get').call(value);
        }
        catch {
            return undefined;
        }
    }
    return value;
}
function readString(source, key) {
    const value = readConfigField(source, key);
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
/**
 * Reads the credential fields out of a live plugin config.
 *
 * DSH hands volatile fields to a plugin as stable accessor objects so a
 * settings edit reaches the next operation without restarting the entry; a
 * plain string is returned by older harness builds, and both shapes are
 * accepted here.
 */
export function readSecretSettings(input) {
    const backend = readString(input, 'backend');
    const settings = {
        ...(readString(input, 'apiKey') ? { apiKey: readString(input, 'apiKey') } : {}),
        ...(readString(input, 'apiKeyEnv') ? { apiKeyEnv: readString(input, 'apiKeyEnv') } : {}),
        ...(backend && (backend === 'auto' || GRAPHIFY_BACKENDS.includes(backend))
            ? { backend: backend }
            : {}),
    };
    return settings;
}
/** Maps an API-key variable name back to the backend that reads it. */
export function inferBackendFromEnvName(envName) {
    if (!envName)
        return null;
    return ENV_NAME_BACKEND[envName] ?? null;
}
async function resolveCredential(credentials, ref) {
    if (!credentials || typeof credentials.resolve !== 'function')
        return undefined;
    try {
        const resolution = await credentials.resolve(ref);
        const value = resolution && typeof resolution === 'object' ? Reflect.get(resolution, 'value') : undefined;
        if (typeof value !== 'string')
            return undefined;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Resolves the spawn environment for one Graphify CLI invocation.
 *
 * Precedence for the key value: the literal `apiKey` from config, then the
 * value behind `apiKeyEnv` in the DSH credential store, then the same name in
 * the launching environment. Graphify's own detection order is deliberately
 * not relied upon: the resolved key is written to the variable name the
 * chosen backend reads, so a machine with several keys set cannot silently
 * route the extraction to a different provider.
 */
export async function resolveSpawnEnvironment(options) {
    const baseEnv = options.baseEnv ?? process.env;
    const settings = options.settings ?? {};
    const env = { ...baseEnv };
    const requested = settings.backend ?? 'auto';
    const refName = settings.apiKeyEnv;
    const backend = requested === 'auto' ? inferBackendFromEnvName(refName) : requested;
    const envName = backend ? BACKEND_API_KEY_ENV[backend] : (refName ?? null);
    const literal = settings.apiKey;
    if (literal) {
        if (!envName) {
            return {
                env,
                backend,
                envName: null,
                source: 'none',
                note: 'An apiKey is configured but the backend is "auto" and apiKeyEnv names no known backend; set "backend" so the key can be exported under the variable Graphify reads.',
            };
        }
        env[envName] = literal;
        return { env, backend, envName, source: 'config' };
    }
    if (!refName) {
        return { env, backend, envName, source: 'none' };
    }
    const stored = await resolveCredential(options.credentials, refName);
    if (stored) {
        env[envName ?? refName] = stored;
        return { env, backend, envName: envName ?? refName, source: 'credentials' };
    }
    const ambient = baseEnv[refName];
    if (typeof ambient === 'string' && ambient.trim().length > 0) {
        if (envName && envName !== refName)
            env[envName] = ambient.trim();
        return { env, backend, envName: envName ?? refName, source: 'environment' };
    }
    return { env, backend, envName, source: 'none' };
}
/** One-line description of a resolution for diagnostics; never includes the key. */
export function describeSpawnEnvironment(resolution) {
    const backend = resolution.backend ?? 'auto-detect';
    if (resolution.source === 'none') {
        if (resolution.note)
            return `key MISSING (${resolution.note})`;
        return `key not configured (${backend}); semantic extraction needs one, or pass /graphify build --code-only`;
    }
    return `${backend} via ${resolution.envName ?? resolution.source} (${resolution.source})`;
}
