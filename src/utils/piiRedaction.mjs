const RAMPART_MODEL_PATH = "rampart-model/";
const RAMPART_MODEL_ID = "rampart-model";
const RAMPART_RUNTIME_PATH = "rampart-runtime/index.js";

let rampartModulePromise = null;

export function normalizePiiRedactionConfig(option) {
	if (option === true) {
		return { enabled: true };
	}

	if (!option || typeof option !== "object") {
		return { enabled: false };
	}

	if (option.enabled === false) {
		return { enabled: false };
	}

	return {
		...option,
		enabled: true
	};
}

export function isPiiRedactionEnabled(option) {
	return normalizePiiRedactionConfig(option).enabled === true;
}

export function resolveEffectivePiiRedactionConfig(
	apiOption,
	embedOption,
	{ localDev = false } = {}
) {
	if (
		embedOption === false ||
		(embedOption &&
			typeof embedOption === "object" &&
			embedOption.enabled === false)
	) {
		return false;
	}

	if (localDev && embedOption !== undefined) {
		return embedOption;
	}

	return apiOption;
}

export function canUseRampartInBrowser() {
	return (
		typeof window !== "undefined" &&
		typeof WebAssembly === "object" &&
		typeof fetch === "function" &&
		typeof Promise === "function"
	);
}

export function resolveDefaultRampartModelUrl() {
	return resolveWidgetAssetUrl(RAMPART_MODEL_PATH);
}

export function resolveDefaultRampartModelRootUrl() {
	return resolveWidgetAssetUrl("");
}

export function resolveDefaultRampartRuntimeUrl() {
	return resolveWidgetAssetUrl(RAMPART_RUNTIME_PATH);
}

export function resolveDefaultRampartRuntimeRootUrl() {
	return new URL("./", resolveDefaultRampartRuntimeUrl()).href;
}

function resolveWidgetAssetUrl(path) {
	const fallbackOrigin =
		typeof window !== "undefined" && window.location?.origin
			? window.location.origin
			: "";
	const scriptUrl = findWidgetScriptUrl();

	try {
		if (scriptUrl) {
			const basePath = path || "./";
			return new URL(basePath, scriptUrl).href;
		}
		if (fallbackOrigin) {
			return new URL(path ? `/${path}` : "/", fallbackOrigin).href;
		}
	} catch {
		// Fall through to the relative path.
	}

	return `/${path}`;
}

export async function createPiiRedactionGuard(option) {
	const config = normalizePiiRedactionConfig(option);
	if (!config.enabled || !canUseRampartInBrowser()) {
		return null;
	}

	const {
		enabled,
		allowRemoteModels,
		fallbackToHeuristicsOnly,
		model,
		modelRootUrl,
		...guardConfig
	} = config;
	const rampart = await loadRampartModule();
	if (typeof rampart.configureTransformersEnv === "function") {
		rampart.configureTransformersEnv({
			allowLocalModels: true,
			allowRemoteModels: allowRemoteModels === true,
			localModelPath: modelRootUrl || resolveDefaultRampartModelRootUrl(),
			wasmPaths: resolveDefaultRampartRuntimeRootUrl()
		});
	}
	const baseGuardConfig = {
		...guardConfig,
		model: model || RAMPART_MODEL_ID
	};

	try {
		return {
			guard: await rampart.createGuard(baseGuardConfig),
			mode: guardConfig.heuristicsOnly ? "heuristics" : "model"
		};
	} catch (error) {
		if (guardConfig.heuristicsOnly || fallbackToHeuristicsOnly === false) {
			throw error;
		}

		console.warn(
			"DOCSBOT: Full PII redaction model failed to load; falling back to heuristics-only redaction.",
			error
		);
		return {
			guard: await rampart.createGuard({
				...guardConfig,
				heuristicsOnly: true
			}),
			mode: "heuristics"
		};
	}
}

async function loadRampartModule() {
	if (!rampartModulePromise) {
		rampartModulePromise = import(
			/* webpackIgnore: true */ resolveDefaultRampartRuntimeUrl()
		);
	}

	return rampartModulePromise;
}

function findWidgetScriptUrl() {
	if (typeof document === "undefined") {
		return "";
	}

	const currentScript = document.currentScript;
	if (currentScript?.src) {
		return currentScript.src;
	}

	const scripts = Array.from(document.getElementsByTagName("script"));
	const widgetScript = scripts
		.map((script) => script.src)
		.reverse()
		.find((src) => /\/chat(?:\.[a-f0-9]{8})?\.js(?:[?#].*)?$/i.test(src));

	return widgetScript || "";
}
