/**
 * Staged state behind the Graphify settings tab.
 *
 * Kept apart from the rendering module so the staging logic can be exercised
 * without a browser: this file imports the settings-form model and the field
 * types only as types, and receives the model instance from the renderer.
 */
import type { SettingsFormModel, SettingsFormPathOp, SettingsFormScope, SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives';
/** Locale namespace owned by this tab. */
export declare const NS = "graphify-settings";
/** Settings namespace the Host registers for this plugin (its profile entry id). */
export declare const SETTINGS_NS = "dsh-graphify";
/** Field staging the credential literal. */
export declare const API_KEY_FIELD = "apiKey";
/** Field naming the credential reference the Host resolves at build time. */
export declare const API_KEY_ENV_FIELD = "apiKeyEnv";
/** One Graphify settings section as the Host serializes it. */
export interface GraphifySettingsSection {
    /** Credential literal, redacted from every response while stored. */
    apiKey?: string;
    /** Credential reference the Host resolves at build time. */
    apiKeyEnv?: string;
    /** Backend override; `auto` infers it from the reference. */
    backend?: string;
}
/** The shared configuration form for the `dsh-graphify` entry. */
export type GraphifySettingsForm = SettingsFormScope<GraphifySettingsSection>;
/** Card state: the shared form shell plus the copy each control renders. */
export interface GraphifySettingsState extends SettingsFormShell {
    /** Staged text of the credential reference. */
    apiKeyEnvText: string;
    /** Whether saving would leave a user-layer entry for the reference. */
    apiKeyEnvOverridden: boolean;
    /** Whether the staged reference is not a value this field accepts. */
    apiKeyEnvInvalid: boolean;
    /** Staged text of the write-only credential control. */
    apiKeyText: string;
    /** Whether the stored section already carries a credential literal. */
    apiKeyConfigured: boolean;
}
/**
 * Stage one card's edits over the `dsh-graphify` namespace.
 *
 * A settings write is a revision-fenced document mutation, so nothing here
 * commits per keystroke: the model holds drafts and only the save writes them.
 */
export declare class GraphifySettingsController {
    private readonly form;
    private readonly model;
    private readonly listeners;
    private readonly unsubscribe;
    private snapshot;
    /**
     * @param form - the shared configuration form for the `dsh-graphify` entry.
     * @param model - the staging model the renderer built over that form.
     */
    constructor(form: GraphifySettingsForm, model: SettingsFormModel<GraphifySettingsSection>);
    /** @returns the card state to render. */
    getSnapshot: () => GraphifySettingsState;
    /** @param listener - invoked after each published state. */
    subscribe: (listener: () => void) => (() => void);
    /** @param field - control name the card reports. */
    edit: (field: string, text: string) => void;
    /** @param field - control whose override should clear on save. */
    resetField: (field: string) => void;
    /** Write every staged edit and re-render from what the Host accepted. */
    save: () => Promise<void>;
    /** Drop every staged edit. */
    discard: () => void;
    /** Release the form subscription. */
    dispose: () => void;
    /** Rebuild the render state from the model. */
    private project;
    /** @returns whether the stored section already carries a credential literal. */
    private hasStoredKey;
    /** Replace the published snapshot and notify every reader. */
    private publish;
}
/** The write one save sends for the credential literal. */
export declare function credentialWriteOp(text: string): SettingsFormPathOp;
/** Localized copy this tab renders. */
export declare const settingsCopy: {
    readonly namespace: "graphify-settings";
    readonly zh: {
        readonly title: "Graphify";
        readonly description: "让 Graphify 的语义抽取使用一个 LLM key；纯代码语料不需要它。";
        readonly apiKeyEnv: "凭据引用";
        readonly apiKeyEnvHint: "DSH 凭据库里以该名字保存的密钥，例如 DEEPSEEK_API_KEY 或 GEMINI_API_KEY。";
        readonly apiKeyEnvInvalid: "凭据引用只能包含字母、数字和下划线，且不能以数字开头。";
        readonly apiKey: "API key";
        readonly apiKeyHint: "直接写入本 profile 的插件配置；留空则保留当前值。";
        readonly apiKeySet: "已直接配置一个 key。";
        readonly apiKeyUnset: "未直接配置；构建时改用上面的凭据引用或启动环境变量。";
        readonly backendHint: "后端由凭据引用推断：GEMINI_API_KEY→gemini、MOONSHOT_API_KEY→kimi、ANTHROPIC_API_KEY→claude、OPENAI_API_KEY→openai，其余按 deepseek。图片节点只有前四者能抽取。";
        readonly readOnly: "该部署以只读方式保存设置。";
        readonly unavailable: "该插件未加载，暂时无法配置。";
        readonly save: "保存";
        readonly saving: "保存中…";
        readonly saveFailed: "该部署没有接受这些值，已保留以便修正。";
        readonly overridden: "已覆盖";
        readonly reset: "恢复默认";
    };
    readonly en: Record<"description" | "unavailable" | "apiKey" | "apiKeyEnv" | "title" | "apiKeyEnvHint" | "apiKeyEnvInvalid" | "apiKeyHint" | "apiKeySet" | "apiKeyUnset" | "backendHint" | "readOnly" | "save" | "saving" | "saveFailed" | "overridden" | "reset", string>;
};
/** Package name the plugin manager keys an installed package's section by. */
export declare const PACKAGE_NAME = "dsh-graphify";
/** Slot the plugin manager renders an installed package's configuration into. */
export declare const SETTINGS_SLOT = "plugins.bundle.config";
/** The Web client surface the registration needs, structurally typed. */
export interface SettingsSurface {
    /** Shared configuration-form service, when the deployment composes it. */
    configForms: {
        /** @param entryId - profile entry id whose section this card edits. */
        get: (entryId: string) => GraphifySettingsForm;
        /** @param namespaces - namespaces whose presence gates the registration. */
        whileServed: (namespaces: readonly string[], register: () => () => void) => () => void;
    };
    /** Slot service used to contribute the section. */
    slots: {
        inject: (name: string, register: () => () => void) => () => void;
        register: (entry: Record<string, unknown>, render: unknown) => () => void;
    };
    /** Locale service: dictionaries plus the binder this section's copy renders through. */
    locale: {
        register: (namespace: string, dictionaries: {
            zh: Record<string, string>;
            en: Record<string, string>;
        }) => () => void;
        bind: (namespace: string) => (key: string) => string;
    };
    /** Cordis effect helper. */
    effect: (callback: () => () => void, label?: string) => void;
}
/** What the renderer supplies to the registration: its controller and its component. */
export interface SettingsRegistrationDeps {
    /** @param form - the shared form the section's controller stages edits over. */
    buildController: (form: GraphifySettingsForm) => GraphifySettingsController;
    /** Component the slot renders; it receives `{ controller, t }`. */
    render: unknown;
}
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
export declare function registerPackageSettings(ctx: unknown, deps: SettingsRegistrationDeps): {
    slot: string;
    key: string;
};
