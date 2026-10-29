/**
 * Staged state behind the Graphify settings tab.
 *
 * Kept apart from the rendering module so the staging logic can be exercised
 * without a browser: this file imports the settings-form model and the field
 * types only as types, and receives the model instance from the renderer.
 */
/** Locale namespace owned by this tab. */
export const NS = 'graphify-settings';
/** Settings namespace the Host registers for this plugin (its profile entry id). */
export const SETTINGS_NS = 'dsh-graphify';
/** Field staging the credential literal. */
export const API_KEY_FIELD = 'apiKey';
/** Field naming the credential reference the Host resolves at build time. */
export const API_KEY_ENV_FIELD = 'apiKeyEnv';
const zh = {
    title: 'Graphify',
    description: '让 Graphify 的语义抽取使用一个 LLM key；纯代码语料不需要它。',
    apiKeyEnv: '凭据引用',
    apiKeyEnvHint: 'DSH 凭据库里以该名字保存的密钥，例如 DEEPSEEK_API_KEY 或 GEMINI_API_KEY。',
    apiKeyEnvInvalid: '凭据引用只能包含字母、数字和下划线，且不能以数字开头。',
    apiKey: 'API key',
    apiKeyHint: '直接写入本 profile 的插件配置；留空则保留当前值。',
    apiKeySet: '已直接配置一个 key。',
    apiKeyUnset: '未直接配置；构建时改用上面的凭据引用或启动环境变量。',
    backendHint: '后端由凭据引用推断：GEMINI_API_KEY→gemini、MOONSHOT_API_KEY→kimi、ANTHROPIC_API_KEY→claude、OPENAI_API_KEY→openai，其余按 deepseek。图片节点只有前四者能抽取。',
    readOnly: '该部署以只读方式保存设置。',
    unavailable: '该插件未加载，暂时无法配置。',
    save: '保存',
    saving: '保存中…',
    saveFailed: '该部署没有接受这些值，已保留以便修正。',
    overridden: '已覆盖',
    reset: '恢复默认',
};
const en = {
    title: 'Graphify',
    description: 'Let Graphify use an LLM key for semantic extraction. A code-only corpus does not need one.',
    apiKeyEnv: 'Credential reference',
    apiKeyEnvHint: 'A key saved under this name in the DSH credential store, such as DEEPSEEK_API_KEY or GEMINI_API_KEY.',
    apiKeyEnvInvalid: 'A credential reference takes letters, digits, and underscores, and cannot start with a digit.',
    apiKey: 'API key',
    apiKeyHint: 'Written into this profile’s plugin configuration. Leave blank to keep the current value.',
    apiKeySet: 'A key is configured here.',
    apiKeyUnset: 'No key configured here; builds use the reference above or the launching environment.',
    backendHint: 'The backend is inferred from the reference: GEMINI_API_KEY→gemini, MOONSHOT_API_KEY→kimi, ANTHROPIC_API_KEY→claude, OPENAI_API_KEY→openai, anything else deepseek. Only the first four extract image nodes.',
    readOnly: 'This deployment stores settings read-only.',
    unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
    save: 'Save',
    saving: 'Saving…',
    saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
    overridden: 'Overridden',
    reset: 'Reset to default',
};
/**
 * Stage one card's edits over the `dsh-graphify` namespace.
 *
 * A settings write is a revision-fenced document mutation, so nothing here
 * commits per keystroke: the model holds drafts and only the save writes them.
 */
export class GraphifySettingsController {
    form;
    model;
    listeners = new Set();
    unsubscribe;
    snapshot;
    /**
     * @param form - the shared configuration form for the `dsh-graphify` entry.
     * @param model - the staging model the renderer built over that form.
     */
    constructor(form, model) {
        this.form = form;
        this.model = model;
        this.snapshot = this.project();
        this.unsubscribe = form.subscribe(() => { this.publish(); });
    }
    /** @returns the card state to render. */
    getSnapshot = () => this.snapshot;
    /** @param listener - invoked after each published state. */
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    /** @param field - control name the card reports. */
    edit = (field, text) => {
        this.model.actions().edit(field, text);
        this.publish();
    };
    /** @param field - control whose override should clear on save. */
    resetField = (field) => {
        this.model.actions().resetField(field);
        this.publish();
    };
    /** Write every staged edit and re-render from what the Host accepted. */
    save = async () => {
        try {
            await this.model.actions().save();
        }
        finally {
            this.publish();
        }
    };
    /** Drop every staged edit. */
    discard = () => {
        this.model.actions().discard();
        this.publish();
    };
    /** Release the form subscription. */
    dispose = () => {
        this.unsubscribe();
        this.listeners.clear();
        this.model.dispose();
    };
    /** Rebuild the render state from the model. */
    project() {
        const shell = this.model.shell();
        const env = this.model.field(API_KEY_ENV_FIELD);
        const key = this.model.field(API_KEY_FIELD);
        return {
            ...shell,
            apiKeyEnvText: env.text,
            apiKeyEnvOverridden: env.overridden,
            apiKeyEnvInvalid: env.invalid,
            apiKeyText: key.text,
            apiKeyConfigured: this.hasStoredKey(),
        };
    }
    /** @returns whether the stored section already carries a credential literal. */
    hasStoredKey() {
        const user = this.form.getSnapshot().user;
        if (typeof user !== 'object' || user === null)
            return false;
        const value = user[API_KEY_FIELD];
        return typeof value === 'string' && value !== '';
    }
    /** Replace the published snapshot and notify every reader. */
    publish() {
        this.snapshot = this.project();
        for (const listener of [...this.listeners])
            listener();
    }
}
/** The write one save sends for the credential literal. */
export function credentialWriteOp(text) {
    return { op: 'set', path: [API_KEY_FIELD], value: text };
}
/** Localized copy this tab renders. */
export const settingsCopy = { namespace: NS, zh, en };
/** Package name the plugin manager keys an installed package's section by. */
export const PACKAGE_NAME = 'dsh-graphify';
/** Slot the plugin manager renders an installed package's configuration into. */
export const SETTINGS_SLOT = 'plugins.bundle.config';
/**
 * Contribute the Graphify configuration section to the plugin's own page.
 *
 * The section is registered through `whileServed`, so it exists only while the
 * Host serves the `dsh-graphify` settings namespace; an older build of this
 * plugin therefore shows no empty form.
 *
 * @param ctx - a context that has `configForms`, `slots`, and `locale` present.
 * @param deps - the controller factory and the component to render.
 * @returns the slot name and key the section registered under.
 */
export function registerPackageSettings(ctx, deps) {
    const surface = ctx;
    const registration = { slot: SETTINGS_SLOT, key: PACKAGE_NAME };
    surface.effect(() => surface.locale.register(NS, { zh: settingsCopy.zh, en: settingsCopy.en }), 'dsh-graphify: settings dictionaries');
    const t = surface.locale.bind(NS);
    surface.effect(() => surface.configForms.whileServed([SETTINGS_NS], () => {
        const controller = deps.buildController(surface.configForms.get(SETTINGS_NS));
        const off = surface.slots.inject(registration.slot, () => surface.slots.register({
            name: registration.slot,
            key: registration.key,
            locale: NS,
            inject: () => ({ controller, t }),
        }, deps.render));
        return () => {
            off();
            controller.dispose();
        };
    }), 'dsh-graphify: package configuration');
    return registration;
}
