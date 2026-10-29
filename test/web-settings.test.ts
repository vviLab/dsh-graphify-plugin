import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  API_KEY_ENV_FIELD,
  API_KEY_FIELD,
  GraphifySettingsController,
  credentialWriteOp,
  registerPackageSettings,
  settingsCopy,
  type GraphifySettingsForm,
  type SettingsSurface,
} from '../src/web-settings-model.ts'
import type { SettingsFormModel } from '@deepseek-ai/dsh-client-ui-primitives'

/** One accepted section plus the stored user layer, as the Host serves it. */
interface FakeFormState {
  /** Section values the Host accepted. */
  value: Record<string, unknown>
  /** Composition layer a cleared field reverts to. */
  base: Record<string, unknown>
  /** Stored user layer; presence of a field marks it overridden. */
  user: Record<string, unknown>
}

/**
 * Build a form double that records the mutations it receives.
 * @param initial - starting layers the Host would serve.
 * @returns the form, the recorded mutation batches, and an invalidation trigger.
 */
function createFakeForm(initial: Partial<FakeFormState> = {}) {
  const state: FakeFormState = {
    value: { apiKeyEnv: 'DEEPSEEK_API_KEY' },
    base: { apiKeyEnv: 'DEEPSEEK_API_KEY' },
    user: {},
    ...initial,
  }
  const batches: unknown[][] = []
  let listener: (() => void) | undefined
  const form = {
    getSnapshot: () => ({
      status: 'ready' as const,
      value: state.value,
      base: state.base,
      user: state.user,
      writable: true,
      revision: 3,
    }),
    subscribe: (next: () => void) => {
      listener = next
      return () => { listener = undefined }
    },
    mutate: async (ops: readonly unknown[]) => {
      batches.push([...ops])
      return true
    },
  } as unknown as GraphifySettingsForm
  return { form, batches, emit: () => listener?.() }
}

/**
 * Build a staging-model double: one draft per field, plus a saved flag.
 * @param overrides - field states the model should report.
 */
function createFakeModel(overrides: Record<string, { text: string, overridden?: boolean, invalid?: boolean }> = {}) {
  const drafts = new Map(Object.entries(overrides).map(([field, state]) => [field, { ...state }]))
  const calls = { save: 0, discard: 0, dispose: 0 }
  const model = {
    shell: () => ({
      available: true,
      writable: true,
      dirty: drafts.size > 0,
      invalid: [...drafts.values()].some((draft) => draft.invalid === true),
      saving: false,
      failed: false,
    }),
    field: (name: string) => {
      const draft = drafts.get(name)
      return {
        text: draft?.text ?? '',
        overridden: draft?.overridden ?? false,
        invalid: draft?.invalid ?? false,
      }
    },
    actions: () => ({
      edit: (field: string, text: string) => { drafts.set(field, { text }) },
      resetField: (field: string) => { drafts.delete(field) },
      save: async () => { calls.save += 1 },
      discard: () => { drafts.clear(); calls.discard += 1 },
    }),
    dispose: () => { calls.dispose += 1 },
  } as unknown as SettingsFormModel<never>
  return { model, calls, drafts }
}

describe('Graphify settings card controller', () => {
  it('reports the accepted reference and a stored literal', () => {
    const { form } = createFakeForm({ user: { [API_KEY_FIELD]: 'sk-stored' } })
    const { model } = createFakeModel({ [API_KEY_ENV_FIELD]: { text: 'DEEPSEEK_API_KEY' } })
    const controller = new GraphifySettingsController(form, model as never)

    const state = controller.getSnapshot()
    assert.equal(state.apiKeyEnvText, 'DEEPSEEK_API_KEY')
    assert.equal(state.apiKeyConfigured, true)
    controller.dispose()
  })

  it('treats a missing literal as unconfigured', () => {
    const { form } = createFakeForm()
    const { model } = createFakeModel()
    const controller = new GraphifySettingsController(form, model as never)

    assert.equal(controller.getSnapshot().apiKeyConfigured, false)
    assert.equal(controller.getSnapshot().apiKeyText, '')
    controller.dispose()
  })

  it('publishes staged drafts and their override state', () => {
    const { form } = createFakeForm()
    const { model } = createFakeModel({ [API_KEY_ENV_FIELD]: { text: 'GEMINI_API_KEY', overridden: true } })
    const controller = new GraphifySettingsController(form, model as never)

    const state = controller.getSnapshot()
    assert.equal(state.apiKeyEnvText, 'GEMINI_API_KEY')
    assert.equal(state.apiKeyEnvOverridden, true)
    assert.equal(state.dirty, true)
    controller.dispose()
  })

  it('publishes an invalid draft instead of pretending it is acceptable', () => {
    const { form } = createFakeForm()
    const { model } = createFakeModel({ [API_KEY_ENV_FIELD]: { text: '1bad', invalid: true } })
    const controller = new GraphifySettingsController(form, model as never)

    assert.equal(controller.getSnapshot().invalid, true)
    controller.dispose()
  })

  it('delegates save and discard to the staging model', async () => {
    const { form } = createFakeForm()
    const { model, calls } = createFakeModel({ [API_KEY_FIELD]: { text: 'sk-new' } })
    const controller = new GraphifySettingsController(form, model as never)

    await controller.save()
    controller.discard()

    assert.equal(calls.save, 1)
    assert.equal(calls.discard, 1)
    controller.dispose()
    assert.equal(calls.dispose, 1)
  })

  it('notifies subscribers when the Host section changes underneath', () => {
    const { form, emit } = createFakeForm()
    const { model } = createFakeModel()
    const controller = new GraphifySettingsController(form, model as never)
    let renders = 0
    const off = controller.subscribe(() => { renders += 1 })

    emit()
    assert.equal(renders, 1)

    off()
    emit()
    assert.equal(renders, 1)
    controller.dispose()
  })

  it('addresses the credential literal by field name', () => {
    assert.deepEqual(credentialWriteOp('sk-value'), {
      op: 'set',
      path: ['apiKey'],
      value: 'sk-value',
    })
  })
})

describe('Graphify settings copy', () => {
  it('keeps both dictionaries on the same keys', () => {
    assert.deepEqual(Object.keys(settingsCopy.zh).sort(), Object.keys(settingsCopy.en).sort())
  })

  it('fills every string', () => {
    for (const dictionary of [settingsCopy.zh, settingsCopy.en]) {
      for (const [key, value] of Object.entries(dictionary)) {
        assert.ok(value.length > 0, `empty copy for ${key}`)
      }
    }
  })
})

/**
 * Build a Web client surface double that records what a registration touches.
 * @param options - whether the controller should be disposed, and the render sentinel.
 */
function createFakeSurface() {
  const record = {
    namespaces: [] as readonly string[],
    registration: undefined as Record<string, unknown> | undefined,
    render: undefined as unknown,
    injected: undefined as Record<string, unknown> | undefined,
    disposed: 0,
    effects: [] as string[],
  }
  let controller: { dispose: () => void } | undefined
  const surface = {
    configForms: {
      get: (entryId: string) => ({ entryId }),
      whileServed: (namespaces: readonly string[], register: () => () => void) => {
        record.namespaces = namespaces
        return register()
      },
    },
    slots: {
      inject: (name: string, register: () => () => void) => {
        assert.equal(name, 'plugins.bundle.config')
        return register()
      },
      register: (entry: Record<string, unknown>, render: unknown) => {
        record.registration = entry
        record.render = render
        const inject = entry.inject as () => Record<string, unknown>
        record.injected = inject()
        return () => {}
      },
    },
    locale: {
      register: (namespace: string) => {
        assert.equal(namespace, 'graphify-settings')
        return () => {}
      },
      bind: () => (key: string) => key,
    },
    effect: (callback: () => () => void, label?: string) => {
      record.effects.push(label ?? '')
      const dispose = callback()
      if (label === 'dsh-graphify: package configuration') disposeOnTeardown = dispose
    },
  } as unknown as SettingsSurface
  let disposeOnTeardown: (() => void) | undefined
  return { surface, record, dispose: () => disposeOnTeardown?.() }
}

describe('Graphify package settings registration', () => {
  it('registers the section on the installed package page, keyed by package name', () => {
    const { surface, record } = createFakeSurface()
    const controller = { dispose: () => {} } as unknown as GraphifySettingsController
    const result = registerPackageSettings(surface, {
      buildController: () => controller,
      render: 'PANEL_SENTINEL',
    })

    assert.deepEqual(result, { slot: 'plugins.bundle.config', key: 'dsh-graphify' })
    assert.deepEqual(record.namespaces, ['dsh-graphify'])
    assert.equal(record.registration?.name, 'plugins.bundle.config')
    assert.equal(record.registration?.key, 'dsh-graphify')
    assert.equal(record.registration?.locale, 'graphify-settings')
    assert.equal(record.render, 'PANEL_SENTINEL')
    assert.equal(record.injected?.controller, controller)
    assert.equal(typeof record.injected?.t, 'function')
  })

  it('tears the section down when the namespace stops being served', () => {
    const { surface, record, dispose } = createFakeSurface()
    let disposed = 0
    const controller = { dispose: () => { disposed += 1 } } as unknown as GraphifySettingsController
    registerPackageSettings(surface, { buildController: () => controller, render: 'PANEL' })

    dispose()
    assert.equal(disposed, 1)
    assert.ok(record.effects.includes('dsh-graphify: settings dictionaries'))
    assert.ok(record.effects.includes('dsh-graphify: package configuration'))
  })
})
