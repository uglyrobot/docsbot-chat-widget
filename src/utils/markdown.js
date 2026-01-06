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
 * - $...$ → $$...$$ (single dollar inline math, conservative: only when no spaces before/after closing $)
 *
 * @param {string} text - The markdown text to process
 * @returns {string} - The processed text with normalized math delimiters
 */
export function preprocessMath(text) {
	if (!text || typeof text !== 'string') return text;

	// Store code blocks and inline code to restore later
	const codeBlocks = [];
	const inlineCodes = [];
	let result = text;

	// Extract code blocks (triple backticks) first, before inline code
	// This handles code blocks with optional language identifier
	// Use unique placeholder format to avoid conflicts
	result = result.replace(/```[\s\S]*?```/g, (match) => {
		const placeholder = `\u0001CODEBLOCK${codeBlocks.length}\u0001`;
		codeBlocks.push(match);
		return placeholder;
	});

	// Extract inline code (single backticks) - but not inside code blocks
	// Match single backticks that aren't part of triple backticks
	result = result.replace(/`[^`\n]+`/g, (match) => {
		const placeholder = `\u0001INLINECODE${inlineCodes.length}\u0001`;
		inlineCodes.push(match);
		return placeholder;
	});

	// Convert \[...\] to $$...$$ (display math)
	result = result.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');

	// Convert \(...\) to $$...$$ (inline math, also uses $$ since single $ is disabled)
	result = result.replace(/\\\(([\s\S]*?)\\\)/g, '$$$$$1$$$$');

	// Convert single dollar sign inline math to double dollar signs
	// Matches expressions with or without spaces around dollar signs, but avoids prices like $100
	// Matches: $P_1$ → $$P_1$$, $\text{Price Ratio}$ → $$\text{Price Ratio}$$, 
	//          $ \text{Price Ratio} $ → $$ \text{Price Ratio} $$, $ \frac{41}{16} \approx 2.56 $ → $$ \frac{41}{16} \approx 2.56 $$
	// Doesn't match: $100, $50 (prices - dollar sign followed by digits)
	// Pattern: (start or whitespace) + $ + (spaces+content+spaces OR content not starting with digit) + $ + (not followed by word char)
	result = result.replace(/(^|\s)\$(\s+[^$]+\s+|\s*[^\d\s$][^$]*)\$(?!\w)/g, (match, before, content) => {
		// before is either start of string ('') or whitespace
		// Content: either \s+[^$]+\s+ (has spaces around, like "$ \text{Price Ratio} $")
		//          or \s*[^\d\s$][^$]* (doesn't start with digit, avoids prices like "$100")
		// (?!\w) ensures not followed by word character (allows punctuation, whitespace, end of string)
		// Return the before part + double dollar math
		return before + '$$' + content + '$$';
	});

	// Restore inline code (restore in reverse order to maintain indices)
	// Use a function to avoid $ being interpreted as special replacement character
	for (let i = inlineCodes.length - 1; i >= 0; i--) {
		const placeholder = `\u0001INLINECODE${i}\u0001`;
		result = result.replace(placeholder, () => inlineCodes[i]);
	}

	// Restore code blocks (restore in reverse order to maintain indices)
	for (let i = codeBlocks.length - 1; i >= 0; i--) {
		const placeholder = `\u0001CODEBLOCK${i}\u0001`;
		result = result.replace(placeholder, () => codeBlocks[i]);
	}

	return result;
}
