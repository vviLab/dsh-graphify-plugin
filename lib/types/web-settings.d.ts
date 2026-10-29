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
import { type ReactElement } from 'react';
import { GraphifySettingsController, settingsCopy } from './web-settings-model.ts';
export { API_KEY_ENV_FIELD, API_KEY_FIELD, GraphifySettingsController, NS, SETTINGS_NS, settingsCopy, } from './web-settings-model.ts';
export type { GraphifySettingsForm, GraphifySettingsSection, GraphifySettingsState, } from './web-settings-model.ts';
/** Props the plugin manager merges into this section's render. */
export interface GraphifySettingsPanelProps {
    /** Controller staged over the `dsh-graphify` settings namespace. */
    controller: GraphifySettingsController;
    /** Localized copy, bound to this section's own dictionary. */
    t: (key: keyof typeof settingsCopy.zh) => string;
    /** Slot view: the manager passes `page` for the configuration section. */
    view?: 'page' | 'summary';
}
/**
 * Render the Graphify configuration section.
 * @param props - the controller and this section's copy.
 * @returns the form, or a one-line description when a summary is requested.
 */
export declare function GraphifySettingsPanel(props: GraphifySettingsPanelProps): ReactElement;
/**
 * Contribute the Graphify configuration section to the plugin's own page.
 * @param ctx - a context that has `configForms`, `slots`, and `locale` present.
 * @returns the slot name and key the section registered under.
 */
export declare function registerGraphifySettings(ctx: unknown): {
    slot: string;
    key: string;
};
