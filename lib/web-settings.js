/**
 * The Graphify configuration section on the plugin's own page in Settings.
 *
 * Where it goes, and why: DSH's Plugins settings page is a shell whose tabs are
 * contributed by cross-plugin features (the market, the plugin manager). A
 * single plugin's settings belong on that plugin's own page instead — the
 * plugin manager already renders a `plugins.bundle.config` section inside the
 * detail page it draws for an installed package (source, version, update,
 * uninstall), keyed by package name. Other third-party plugins use that slot,
 * and it keeps a plugin's configuration beside the thing it configures.
 *
 * The section only appears while the Host serves the `dsh-graphify` settings
 * namespace, so a deployment running an older build of this plugin shows no
 * empty form.
 */
import { createElement, useSyncExternalStore } from 'react';
import { SettingsForm, SettingsFormModel, SettingsSecretField, SettingsValueField, settingsTextField, } from '@deepseek-ai/dsh-client-ui-primitives';
import { API_KEY_ENV_FIELD, API_KEY_FIELD, GraphifySettingsController, credentialWriteOp, registerPackageSettings, } from "./web-settings-model.js";
export { API_KEY_ENV_FIELD, API_KEY_FIELD, GraphifySettingsController, NS, SETTINGS_NS, settingsCopy, } from "./web-settings-model.js";
/** Package name the plugin manager keys an installed package's section by. */
const PACKAGE_NAME = 'dsh-graphify';
/**
 * Render the Graphify configuration section.
 * @param props - the controller and this section's copy.
 * @returns the form, or a one-line description when a summary is requested.
 */
export function GraphifySettingsPanel(props) {
    const { controller, t } = props;
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    if (props.view === 'summary') {
        return createElement('span', { 'data-graphify-settings': 'summary' }, t('description'));
    }
    const disabled = !state.writable || state.saving;
    const labels = {
        unavailable: t('unavailable'),
        readOnly: t('readOnly'),
        saveFailed: t('saveFailed'),
        save: t('save'),
        saving: t('saving'),
    };
    const controls = createElement('div', { 'data-graphify-settings': 'form', style: { display: 'flex', flexDirection: 'column', gap: 14 } }, createElement('p', { style: { margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-secondary)' } }, t('description')), createElement(SettingsValueField, {
        id: 'graphify-settings-api-key-env',
        label: t('apiKeyEnv'),
        hint: t('apiKeyEnvHint'),
        text: state.apiKeyEnvText,
        overridden: state.apiKeyEnvOverridden,
        invalid: state.apiKeyEnvInvalid,
        overriddenLabel: t('overridden'),
        resetLabel: t('reset'),
        invalidLabel: t('apiKeyEnvInvalid'),
        disabled,
        onEdit: (text) => { controller.edit(API_KEY_ENV_FIELD, text); },
        onReset: () => { controller.resetField(API_KEY_ENV_FIELD); },
        placeholder: 'DEEPSEEK_API_KEY',
    }), createElement(SettingsSecretField, {
        id: 'graphify-settings-api-key',
        label: t('apiKey'),
        hint: t('apiKeyHint'),
        text: state.apiKeyText,
        configured: state.apiKeyConfigured,
        stateLabel: state.apiKeyConfigured ? t('apiKeySet') : t('apiKeyUnset'),
        disabled,
        onEdit: (text) => { controller.edit(API_KEY_FIELD, text); },
    }), createElement('p', {
        style: {
            margin: 0,
            color: 'var(--dsw-alias-label-tertiary)',
            fontSize: 12,
            lineHeight: '18px',
        },
    }, t('backendHint')));
    return createElement(SettingsForm, {
        labels,
        state,
        onSave: () => { void controller.save(); },
        onDiscard: controller.discard,
        children: controls,
    });
}
/**
 * Build the controller and its staging model over one form.
 * @param form - the shared configuration form for the `dsh-graphify` entry.
 * @returns the controller the section renders from.
 */
function buildController(form) {
    const model = new SettingsFormModel(form, [settingsTextField(API_KEY_ENV_FIELD)], [{ field: API_KEY_FIELD, write: (text) => form.mutate([credentialWriteOp(text)]) }]);
    return new GraphifySettingsController(form, model);
}
/**
 * Contribute the Graphify configuration section to the plugin's own page.
 * @param ctx - a context that has `configForms`, `slots`, and `locale` present.
 * @returns the slot name and key the section registered under.
 */
export function registerGraphifySettings(ctx) {
    return registerPackageSettings(ctx, {
        buildController,
        render: GraphifySettingsPanel,
    });
}
