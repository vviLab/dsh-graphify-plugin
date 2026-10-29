import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BACKEND_API_KEY_ENV,
  describeSpawnEnvironment,
  inferBackendFromEnvName,
  readSecretSettings,
  resolveSpawnEnvironment,
} from '../src/spawn-env.ts'

/** Builds the accessor object DSH hands a plugin for a volatile config field. */
function accessor<T>(value: T): { get: () => T } {
  return { get: () => value }
}

describe('readSecretSettings', () => {
  it('reads plain values from an older harness build', () => {
    const settings = readSecretSettings({ apiKey: 'sk-plain', apiKeyEnv: 'GEMINI_API_KEY', backend: 'gemini' })
    assert.deepEqual(settings, { apiKey: 'sk-plain', apiKeyEnv: 'GEMINI_API_KEY', backend: 'gemini' })
  })

  it('unwraps the volatile accessors DSH passes on every invocation', () => {
    const settings = readSecretSettings({
      apiKey: accessor('sk-live'),
      apiKeyEnv: accessor('DEEPSEEK_API_KEY'),
      backend: accessor('deepseek'),
    })
    assert.deepEqual(settings, { apiKey: 'sk-live', apiKeyEnv: 'DEEPSEEK_API_KEY', backend: 'deepseek' })
  })

  it('drops blank values and unknown backends', () => {
    const settings = readSecretSettings({ apiKey: '   ', apiKeyEnv: '', backend: 'mystery' })
    assert.deepEqual(settings, {})
  })

  it('tolerates a config that is not an object', () => {
    assert.deepEqual(readSecretSettings(undefined), {})
    assert.deepEqual(readSecretSettings('DEEPSEEK_API_KEY'), {})
  })
})

describe('backend inference', () => {
  it('maps every known key variable to its backend', () => {
    for (const [backend, envName] of Object.entries(BACKEND_API_KEY_ENV)) {
      assert.equal(inferBackendFromEnvName(envName), backend)
    }
  })

  it('reports no backend for an unknown or absent name', () => {
    assert.equal(inferBackendFromEnvName('SOME_OTHER_KEY'), null)
    assert.equal(inferBackendFromEnvName(undefined), null)
  })
})

describe('resolveSpawnEnvironment', () => {
  it('exports a literal key under the backend variable', async () => {
    const resolution = await resolveSpawnEnvironment({
      settings: { apiKey: 'sk-literal', backend: 'deepseek' },
      baseEnv: {},
    })
    assert.equal(resolution.source, 'config')
    assert.equal(resolution.backend, 'deepseek')
    assert.equal(resolution.env.DEEPSEEK_API_KEY, 'sk-literal')
  })

  it('infers the backend from apiKeyEnv when backend is auto', async () => {
    const resolution = await resolveSpawnEnvironment({
      settings: { apiKey: 'sk-literal', apiKeyEnv: 'MOONSHOT_API_KEY', backend: 'auto' },
      baseEnv: {},
    })
    assert.equal(resolution.backend, 'kimi')
    assert.equal(resolution.env.MOONSHOT_API_KEY, 'sk-literal')
  })

  it('explains a literal key that no backend can route', async () => {
    const resolution = await resolveSpawnEnvironment({
      settings: { apiKey: 'sk-literal', backend: 'auto' },
      baseEnv: {},
    })
    assert.equal(resolution.source, 'none')
    assert.equal(resolution.envName, null)
    assert.match(resolution.note ?? '', /set "backend"/)
  })

  it('prefers the credential store over the launching environment', async () => {
    const resolution = await resolveSpawnEnvironment({
      settings: { apiKeyEnv: 'DEEPSEEK_API_KEY', backend: 'auto' },
      baseEnv: { DEEPSEEK_API_KEY: 'sk-ambient' },
      credentials: { resolve: async () => ({ value: 'sk-stored' }) },
    })
    assert.equal(resolution.source, 'credentials')
    assert.equal(resolution.env.DEEPSEEK_API_KEY, 'sk-stored')
  })

  it('falls back to the launching environment when the store has nothing', async () => {
    const resolution = await resolveSpawnEnvironment({
      settings: { apiKeyEnv: 'DEEPSEEK_API_KEY', backend: 'auto' },
      baseEnv: { DEEPSEEK_API_KEY: 'sk-ambient' },
      credentials: { resolve: async () => undefined },
    })
    assert.equal(resolution.source, 'environment')
    assert.equal(resolution.env.DEEPSEEK_API_KEY, 'sk-ambient')
  })

  it('treats an empty stored value as absent', async () => {
    const resolution = await resolveSpawnEnvironment({
      settings: { apiKeyEnv: 'DEEPSEEK_API_KEY', backend: 'auto' },
      baseEnv: {},
      credentials: { resolve: async () => ({ value: '  ' }) },
    })
    assert.equal(resolution.source, 'none')
  })

  it('survives a credential provider that throws', async () => {
    const resolution = await resolveSpawnEnvironment({
      settings: { apiKeyEnv: 'DEEPSEEK_API_KEY', backend: 'auto' },
      baseEnv: {},
      credentials: {
        resolve: async () => {
          throw new Error('store offline')
        },
      },
    })
    assert.equal(resolution.source, 'none')
  })

  it('re-exports the ambient key under a different backend variable', async () => {
    const resolution = await resolveSpawnEnvironment({
      settings: { apiKeyEnv: 'GEMINI_API_KEY', backend: 'openai' },
      baseEnv: { GEMINI_API_KEY: 'sk-gemini' },
    })
    assert.equal(resolution.backend, 'openai')
    assert.equal(resolution.env.OPENAI_API_KEY, 'sk-gemini')
  })

  it('leaves the environment untouched when no key is configured', async () => {
    const resolution = await resolveSpawnEnvironment({ settings: {}, baseEnv: { PATH: '/usr/bin' } })
    assert.equal(resolution.source, 'none')
    assert.deepEqual(resolution.env, { PATH: '/usr/bin' })
  })
})

describe('describeSpawnEnvironment', () => {
  it('names the backend and source without the key', async () => {
    const resolution = await resolveSpawnEnvironment({
      settings: { apiKeyEnv: 'DEEPSEEK_API_KEY', backend: 'auto' },
      baseEnv: {},
      credentials: { resolve: async () => ({ value: 'sk-secret-value' }) },
    })
    const line = describeSpawnEnvironment(resolution)
    assert.match(line, /deepseek/)
    assert.match(line, /credentials/)
    assert.doesNotMatch(line, /sk-secret-value/)
  })

  it('suggests the code-only build when no key resolves', async () => {
    const resolution = await resolveSpawnEnvironment({ settings: {}, baseEnv: {} })
    assert.match(describeSpawnEnvironment(resolution), /--code-only/)
  })
})
