/**
 * Pre-process markdown to convert LaTeX bracket notation to double dollar sign
 * notation that remark-math understands.
 *
 * Converts:
 * - \[...\] → $$...$$ (display math)
 * - \(...\) → $$...$$ (inline math, using $$ since single $ is disabled)
 *
 * @param {string} text - The markdown text to process
 * @returns {string} - The processed text with normalized math delimiters
 */
export function preprocessMath(text) {
	if (!text || typeof text !== 'string') return text;

	// Convert \[...\] to $$...$$ (display math)
	let result = text.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');

	// Convert \(...\) to $$...$$ (inline math, also uses $$ since single $ is disabled)
	result = result.replace(/\\\(([\s\S]*?)\\\)/g, '$$$$$1$$$$');

	return result;
}
