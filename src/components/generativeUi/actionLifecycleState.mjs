// Compare selected values, not validation/touched metadata or object key order.
export function actionValuesFingerprint(state, formName) {
	const scoped = formName && state?.[formName] ? state[formName] : state;
	const normalize = (value) => {
		if (Array.isArray(value)) return value.map(normalize);
		if (value && typeof value === 'object') {
			if (Object.prototype.hasOwnProperty.call(value, 'value'))
				return normalize(value.value);
			return Object.fromEntries(
				Object.keys(value)
					.sort()
					.map((key) => [key, normalize(value[key])])
			);
		}
		return value;
	};
	return JSON.stringify(normalize(scoped || {}));
}
