import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_GRAPHIFY_VERSION,
  llmExtrasForBackend,
  resolveGraphifyCliRuntime,
  resolveGraphifyRuntime,
  uvPackageSpec,
} from '../src/server-process.ts'
import { Config } from '../src/config.ts'
import { missingSdkHint } from '../src/commands.ts'

describe('uv fallback extras', () => {
  it('asks for the OpenAI SDK for every OpenAI-compatible backend', () => {
    for (const backend of ['openai', 'deepseek', 'gemini', 'kimi', 'ollama']) {
      assert.deepEqual(llmExtrasForBackend(backend), ['openai'], backend)
    }
  })

  it('asks for the Anthropic SDK when the backend is claude', () => {
    assert.deepEqual(llmExtrasForBackend('claude'), ['anthropic'])
  })

  it('falls back to the OpenAI SDK when no backend is known', () => {
    assert.deepEqual(llmExtrasForBackend(undefined), ['openai'])
    assert.deepEqual(llmExtrasForBackend(null), ['openai'])
    assert.deepEqual(llmExtrasForBackend('auto'), ['openai'])
  })

  it('builds a pinned spec with extras', () => {
    assert.equal(uvPackageSpec('0.9.57', ['openai']), 'graphifyy[openai]==0.9.57')
    assert.equal(uvPackageSpec('0.9.57', ['mcp', 'openai']), 'graphifyy[mcp,openai]==0.9.57')
    assert.equal(uvPackageSpec('0.9.57', ['mcp', 'openai', 'openai']), 'graphifyy[mcp,openai]==0.9.57')
    assert.equal(uvPackageSpec('0.9.57'), 'graphifyy==0.9.57')
    assert.equal(uvPackageSpec('0.9.57', ['']), 'graphifyy==0.9.57')
  })
})

describe('missing SDK hint', () => {
  it('restates a per-chunk SDK failure as one install command', () => {
    const hint = missingSdkHint(
      "[graphify] chunk 1/82 failed: the 'openai' package is required for this backend but is not installed.",
      'deepseek',
    )
    assert.ok(hint)
    assert.match(hint, /the 'openai' package/)
    assert.match(hint, new RegExp(`uv tool install 'graphifyy\\[mcp,openai\\]==${DEFAULT_GRAPHIFY_VERSION}' --force`))
  })

  it('names the anthropic extra for the claude backend', () => {
    const hint = missingSdkHint(
      "the 'anthropic' package is required for this backend but is not installed.",
      'claude',
    )
    assert.ok(hint)
    assert.match(hint, /graphifyy\[mcp,anthropic\]/)
  })

  it('stays out of unrelated failures', () => {
    assert.equal(missingSdkHint('Graphify failed: boom', 'deepseek'), undefined)
    assert.equal(missingSdkHint('error: no LLM API key found (12 files need semantic extraction)'), undefined)
  })
})

describe('uv fallback launcher', () => {
  it('runs the entry point through uvx without touching the project', () => {
    const config = Config({})
    const cli = resolveGraphifyCliRuntime(
      config,
      { operation: 'update', projectRoot: '/tmp/project', flags: [] },
      ['openai'],
    )
    if (cli.available && cli.source === 'uv') {
      const uvx = cli.command === 'uvx'
      assert.ok(uvx || cli.command === 'uv', `unexpected launcher ${cli.command}`)
      const prefix = uvx ? ['--from'] : ['tool', 'run', '--from']
      assert.deepEqual(cli.args.slice(0, prefix.length), prefix)
      assert.equal(cli.args[prefix.length], `graphifyy[openai]==${DEFAULT_GRAPHIFY_VERSION}`)
      assert.equal(cli.args[prefix.length + 1], 'graphify')
      assert.equal(cli.args[prefix.length + 2], 'update')
      assert.equal(cli.args[prefix.length + 3], '/tmp/project')
      assert.ok(!cli.args.includes('--no-project'), 'uvx needs no project guard')
      assert.ok(!cli.args.includes('--with'), 'the launcher form uses --from')
    }

    const mcp = resolveGraphifyRuntime(config)
    if (mcp.available && mcp.source === 'uv') {
      const uvx = mcp.command === 'uvx'
      assert.ok(uvx || mcp.command === 'uv', `unexpected launcher ${mcp.command}`)
      const prefix = uvx ? ['--from'] : ['tool', 'run', '--from']
      assert.deepEqual(mcp.args.slice(0, prefix.length), prefix)
      assert.equal(mcp.args[prefix.length], `graphifyy[mcp]==${DEFAULT_GRAPHIFY_VERSION}`)
      assert.equal(mcp.args[prefix.length + 1], 'graphify-mcp')
    }
  })

  it('keeps only the launcher prefix when no graph path is pinned', () => {
    const mcp = resolveGraphifyRuntime(Config({}))
    if (!mcp.available || mcp.source !== 'uv') return
    const prefix = mcp.command === 'uvx' ? ['--from'] : ['tool', 'run', '--from']
    assert.equal(mcp.args.length, prefix.length + 2)
  })
})
