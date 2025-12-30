import { defaultRemarkPlugins } from 'streamdown';
import remarkExternalLinks from 'remark-external-links';

const externalLinksPlugin = [
	remarkExternalLinks,
	{
		target: '_blank',
		rel: ['noopener', 'noreferrer']
	}
];

// Use all default plugins (includes gfm, math, cjk-friendly, cjk-friendly-gfm-strikethrough)
// Math is configured with singleDollarTextMath: false (requires $$ for all math)
const resolvedPlugins = defaultRemarkPlugins
	? Object.values(defaultRemarkPlugins)
	: [];

export const streamdownRemarkPlugins = [...resolvedPlugins, externalLinksPlugin];

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
