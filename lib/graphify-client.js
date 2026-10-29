window.__ModuleLoader__.load({
	id: "dsh-graphify",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/web-command.ts
		/**
		* Derives the visible command line from its durable structured run.
		* @param event - `/graphify` command run.
		* @returns Command text with trailing parser whitespace removed.
		*/
		function graphifyCommandText(event) {
			return `/${event.data.name}${(event.data.args ?? "").trimEnd()}`;
		}
		/** Graphify-owned command input projection; DSH retains the generic result row. */
		const graphifyCommandInputDefinition = {
			kind: "graphify-command-input",
			target: "chat",
			match: (event) => event.type === "command/run" && event.data.name === "graphify" ? {
				id: String(event.data.commandId),
				role: "start"
			} : null,
			start: (_context, match) => {
				const event = match.event;
				if (event.type !== "command/run") throw new Error("graphify-command-input start requires command/run");
				return {
					commandId: event.data.commandId,
					seq: event.seq,
					time: event.time,
					text: graphifyCommandText(event)
				};
			},
			update: (context) => context.state,
			buildViewNode: (context) => {
				if (context.state === void 0) return null;
				return {
					key: context.key,
					kind: "graphify-command-input",
					id: context.id,
					target: "chat",
					anchorSeq: context.state.seq - .1,
					location: context.start?.location ?? { kind: "unresolved" },
					visibility: "visible",
					data: {
						commandId: context.state.commandId,
						text: context.state.text,
						time: context.state.time
					}
				};
			}
		};
		//#endregion
		//#region src/web-settings-model.ts
		/** Locale namespace owned by this tab. */
		const NS = "graphify-settings";
		/** Settings namespace the Host registers for this plugin (its profile entry id). */
		const SETTINGS_NS = "dsh-graphify";
		/** Field staging the credential literal. */
		const API_KEY_FIELD = "apiKey";
		/** Field naming the credential reference the Host resolves at build time. */
		const API_KEY_ENV_FIELD = "apiKeyEnv";
		const zh$1 = {
			title: "Graphify",
			description: "让 Graphify 的语义抽取使用一个 LLM key；纯代码语料不需要它。",
			apiKeyEnv: "凭据引用",
			apiKeyEnvHint: "DSH 凭据库里以该名字保存的密钥，例如 DEEPSEEK_API_KEY 或 GEMINI_API_KEY。",
			apiKeyEnvInvalid: "凭据引用只能包含字母、数字和下划线，且不能以数字开头。",
			apiKey: "API key",
			apiKeyHint: "直接写入本 profile 的插件配置；留空则保留当前值。",
			apiKeySet: "已直接配置一个 key。",
			apiKeyUnset: "未直接配置；构建时改用上面的凭据引用或启动环境变量。",
			backendHint: "后端由凭据引用推断：GEMINI_API_KEY→gemini、MOONSHOT_API_KEY→kimi、ANTHROPIC_API_KEY→claude、OPENAI_API_KEY→openai，其余按 deepseek。图片节点只有前四者能抽取。",
			readOnly: "该部署以只读方式保存设置。",
			unavailable: "该插件未加载，暂时无法配置。",
			save: "保存",
			saving: "保存中…",
			saveFailed: "该部署没有接受这些值，已保留以便修正。",
			overridden: "已覆盖",
			reset: "恢复默认"
		};
		const en$1 = {
			title: "Graphify",
			description: "Let Graphify use an LLM key for semantic extraction. A code-only corpus does not need one.",
			apiKeyEnv: "Credential reference",
			apiKeyEnvHint: "A key saved under this name in the DSH credential store, such as DEEPSEEK_API_KEY or GEMINI_API_KEY.",
			apiKeyEnvInvalid: "A credential reference takes letters, digits, and underscores, and cannot start with a digit.",
			apiKey: "API key",
			apiKeyHint: "Written into this profile’s plugin configuration. Leave blank to keep the current value.",
			apiKeySet: "A key is configured here.",
			apiKeyUnset: "No key configured here; builds use the reference above or the launching environment.",
			backendHint: "The backend is inferred from the reference: GEMINI_API_KEY→gemini, MOONSHOT_API_KEY→kimi, ANTHROPIC_API_KEY→claude, OPENAI_API_KEY→openai, anything else deepseek. Only the first four extract image nodes.",
			readOnly: "This deployment stores settings read-only.",
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			save: "Save",
			saving: "Saving…",
			saveFailed: "The deployment did not accept these values; they were left for you to correct.",
			overridden: "Overridden",
			reset: "Reset to default"
		};
		/**
		* Stage one card's edits over the `dsh-graphify` namespace.
		*
		* A settings write is a revision-fenced document mutation, so nothing here
		* commits per keystroke: the model holds drafts and only the save writes them.
		*/
		var GraphifySettingsController = class {
			form;
			model;
			listeners = /* @__PURE__ */ new Set();
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
				this.unsubscribe = form.subscribe(() => {
					this.publish();
				});
			}
			/** @returns the card state to render. */
			getSnapshot = () => this.snapshot;
			/** @param listener - invoked after each published state. */
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
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
				} finally {
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
					apiKeyConfigured: this.hasStoredKey()
				};
			}
			/** @returns whether the stored section already carries a credential literal. */
			hasStoredKey() {
				const user = this.form.getSnapshot().user;
				if (typeof user !== "object" || user === null) return false;
				const value = user[API_KEY_FIELD];
				return typeof value === "string" && value !== "";
			}
			/** Replace the published snapshot and notify every reader. */
			publish() {
				this.snapshot = this.project();
				for (const listener of [...this.listeners]) listener();
			}
		};
		/** The write one save sends for the credential literal. */
		function credentialWriteOp(text) {
			return {
				op: "set",
				path: [API_KEY_FIELD],
				value: text
			};
		}
		/** Localized copy this tab renders. */
		const settingsCopy = {
			namespace: NS,
			zh: zh$1,
			en: en$1
		};
		/** Package name the plugin manager keys an installed package's section by. */
		const PACKAGE_NAME = "dsh-graphify";
		/** Slot the plugin manager renders an installed package's configuration into. */
		const SETTINGS_SLOT = "plugins.bundle.config";
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
		function registerPackageSettings(ctx, deps) {
			const surface = ctx;
			const registration = {
				slot: SETTINGS_SLOT,
				key: PACKAGE_NAME
			};
			surface.effect(() => surface.locale.register(NS, {
				zh: settingsCopy.zh,
				en: settingsCopy.en
			}), "dsh-graphify: settings dictionaries");
			const t = surface.locale.bind(NS);
			surface.effect(() => surface.configForms.whileServed([SETTINGS_NS], () => {
				const controller = deps.buildController(surface.configForms.get(SETTINGS_NS));
				const off = surface.slots.inject(registration.slot, () => surface.slots.register({
					name: registration.slot,
					key: registration.key,
					locale: NS,
					inject: () => ({
						controller,
						t
					})
				}, deps.render));
				return () => {
					off();
					controller.dispose();
				};
			}), "dsh-graphify: package configuration");
			return registration;
		}
		//#endregion
		//#region src/web-settings.ts
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
		/**
		* Render the Graphify configuration section.
		* @param props - the controller and this section's copy.
		* @returns the form, or a one-line description when a summary is requested.
		*/
		function GraphifySettingsPanel(props) {
			const { controller, t } = props;
			const state = (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
			if (props.view === "summary") return (0, react.createElement)("span", { "data-graphify-settings": "summary" }, t("description"));
			const disabled = !state.writable || state.saving;
			const labels = {
				unavailable: t("unavailable"),
				readOnly: t("readOnly"),
				saveFailed: t("saveFailed"),
				save: t("save"),
				saving: t("saving")
			};
			const controls = (0, react.createElement)("div", {
				"data-graphify-settings": "form",
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 14
				}
			}, (0, react.createElement)("p", { style: {
				margin: 0,
				fontSize: 13,
				color: "var(--dsw-alias-label-secondary)"
			} }, t("description")), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
				id: "graphify-settings-api-key-env",
				label: t("apiKeyEnv"),
				hint: t("apiKeyEnvHint"),
				text: state.apiKeyEnvText,
				overridden: state.apiKeyEnvOverridden,
				invalid: state.apiKeyEnvInvalid,
				overriddenLabel: t("overridden"),
				resetLabel: t("reset"),
				invalidLabel: t("apiKeyEnvInvalid"),
				disabled,
				onEdit: (text) => {
					controller.edit(API_KEY_ENV_FIELD, text);
				},
				onReset: () => {
					controller.resetField(API_KEY_ENV_FIELD);
				},
				placeholder: "DEEPSEEK_API_KEY"
			}), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.SettingsSecretField, {
				id: "graphify-settings-api-key",
				label: t("apiKey"),
				hint: t("apiKeyHint"),
				text: state.apiKeyText,
				configured: state.apiKeyConfigured,
				stateLabel: state.apiKeyConfigured ? t("apiKeySet") : t("apiKeyUnset"),
				disabled,
				onEdit: (text) => {
					controller.edit(API_KEY_FIELD, text);
				}
			}), (0, react.createElement)("p", { style: {
				margin: 0,
				color: "var(--dsw-alias-label-tertiary)",
				fontSize: 12,
				lineHeight: "18px"
			} }, t("backendHint")));
			return (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.SettingsForm, {
				labels,
				state,
				onSave: () => {
					controller.save();
				},
				onDiscard: controller.discard,
				children: controls
			});
		}
		/**
		* Build the controller and its staging model over one form.
		* @param form - the shared configuration form for the `dsh-graphify` entry.
		* @returns the controller the section renders from.
		*/
		function buildController(form) {
			return new GraphifySettingsController(form, new _deepseek_ai_dsh_client_ui_primitives.SettingsFormModel(form, [(0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)(API_KEY_ENV_FIELD)], [{
				field: API_KEY_FIELD,
				write: (text) => form.mutate([credentialWriteOp(text)])
			}]));
		}
		/**
		* Contribute the Graphify configuration section to the plugin's own page.
		* @param ctx - a context that has `configForms`, `slots`, and `locale` present.
		* @returns the slot name and key the section registered under.
		*/
		function registerGraphifySettings(ctx) {
			return registerPackageSettings(ctx, {
				buildController,
				render: GraphifySettingsPanel
			});
		}
		//#endregion
		//#region src/web-client.ts
		const zh = { "commandInput.aria": "图谱命令输入" };
		const en = { "commandInput.aria": "Graphify command input" };
		const rowStyle = {
			display: "flex",
			flexDirection: "column",
			alignItems: "flex-end",
			gap: 6
		};
		const stackStyle = {
			display: "flex",
			flexDirection: "column",
			alignItems: "flex-end",
			minWidth: 0,
			maxWidth: "min(525px, 82%)"
		};
		const bubbleStyle = {
			overflowWrap: "anywhere",
			background: "var(--dsw-specific-bubble)",
			maxWidth: "100%",
			color: "var(--dsw-alias-label-primary)",
			font: "var(--dsw-font-markdown-code)",
			whiteSpace: "pre-wrap",
			borderRadius: 22,
			padding: "10px 16px"
		};
		/** Right-aligned `/graphify` input bubble without ordinary message actions. */
		const GraphifyCommandInputView = (0, react.memo)(function GraphifyCommandInputView({ node, t }) {
			return (0, react.createElement)("div", {
				style: rowStyle,
				"data-graphify-command-input": "",
				role: "group",
				"aria-label": t("commandInput.aria")
			}, (0, react.createElement)("div", { style: stackStyle }, (0, react.createElement)("div", { style: bubbleStyle }, (0, _deepseek_ai_dsh_client_ui_primitives.projectUserText)(node.data.text, [], ["graphify"], "command"))));
		});
		/** Required DSH Web services for the Graphify command projection and renderer. */
		const inject = [
			"slots",
			"locale",
			"uiConversation"
		];
		/**
		* Registers Graphify's browser-side DSH command presentation.
		* @param ctx - DSH client Cordis context.
		*/
		function apply(ctx) {
			ctx.uiConversation.events.register(graphifyCommandInputDefinition);
			ctx.effect(() => ctx.locale.register("graphify", {
				zh,
				en
			}), "dsh-graphify: dictionaries");
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "graphify-command-input",
				locale: "graphify"
			}, GraphifyCommandInputView));
			ctx.inject([
				"configForms",
				"slots",
				"locale"
			], (settingsCtx) => {
				registerGraphifySettings(settingsCtx);
			});
		}
		//#endregion
		exports.GraphifyCommandInputView = GraphifyCommandInputView;
		exports.GraphifySettingsController = GraphifySettingsController;
		exports.GraphifySettingsPanel = GraphifySettingsPanel;
		exports.apply = apply;
		exports.graphifyCommandInputDefinition = graphifyCommandInputDefinition;
		exports.graphifyCommandText = graphifyCommandText;
		exports.inject = inject;
		exports.registerGraphifySettings = registerGraphifySettings;
		return module.exports;
	}
});

//# sourceMappingURL=graphify-client.js.map