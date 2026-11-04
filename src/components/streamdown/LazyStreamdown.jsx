import React, { lazy, useMemo } from 'react';
import { orderedListGutter } from '../../utils/orderedListGutter.mjs';
import { useConfig } from '../configContext/ConfigContext';

const OrderedList = ({ node, children, start = 1, className = '', style, ...props }) => {
	const itemCount = node?.children?.filter(
		(child) => child.type === 'element' && child.tagName === 'li'
	).length || 1;
	return (
		<ol
			{...props}
			start={start}
			className={`list-decimal whitespace-normal ${className}`}
			data-streamdown="ordered-list"
			style={{ ...style, '--docsbot-list-gutter': orderedListGutter(start, itemCount) }}
		>
			{children}
		</ol>
	);
};

/** Hosts always treated as safe when link safety is on (apex + subdomains via isAllowedHost). */
const LINK_SAFETY_ALWAYS_ALLOWED_HOSTS = ['stripe.com'];

const getHostname = (value) => {
	if (!value) return null;
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) return null;
	if (trimmed.includes('://')) {
		try {
			return new URL(trimmed).hostname;
		} catch (error) {
			return null;
		}
	}
	const hostname = trimmed.split('/')[0];
	return hostname || null;
};

const isAllowedHost = (hostname, allowedHosts) =>
	allowedHosts.some(
		(allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
	);

const isSafeLink = (url, allowedHosts) => {
	if (!url) return false;
	if (url.startsWith('#')) return true;

	let resolvedUrl;
	try {
		resolvedUrl = new URL(url, window.location.origin);
	} catch (error) {
		return false;
	}

	if (resolvedUrl.protocol !== 'http:' && resolvedUrl.protocol !== 'https:') {
		return true;
	}

	return isAllowedHost(resolvedUrl.hostname, allowedHosts);
};

export const LazyStreamdown = lazy(async () => {
	const [
		streamdownModule,
		remarkExternalLinksModule,
		hardenModule,
		codeModule,
		mermaidModule,
		mathModule,
		cjkModule
	] = await Promise.all([
		import('streamdown'),
		import('remark-external-links'),
		import('rehype-harden'),
		import('@streamdown/code'),
		import('@streamdown/mermaid'),
		import('@streamdown/math'),
		import('@streamdown/cjk')
	]);

	const { Streamdown, defaultRemarkPlugins, defaultRehypePlugins } = streamdownModule;
	const remarkExternalLinks =
		remarkExternalLinksModule.default || remarkExternalLinksModule;
	const { harden } = hardenModule;
	const code = codeModule.code || codeModule.default;
	const createMermaidPlugin = mermaidModule.createMermaidPlugin;
	const math = mathModule.math || mathModule.default;
	const cjk = cjkModule.cjk || cjkModule.default;

	const externalLinksPlugin = [
		remarkExternalLinks,
		{
			target: '_blank',
			rel: ['noopener', 'noreferrer']
		}
	];

	// Merge default remark plugins with our custom plugin
	const remarkPlugins = [
		...Object.values(defaultRemarkPlugins),
		externalLinksPlugin
	];

	// Merge default rehype plugins with our custom plugin
	const rehypePlugins = [
		...Object.values(defaultRehypePlugins),
		[
			harden,
			{
				allowedLinkPrefixes: ['*'], // Allow all link prefixes (domains), but protocols are still restricted
				allowedProtocols: [
					'http',
					'https',
					'mailto',
				],
				allowDataImages: false,
			},
		],
	];

	const StreamdownWithPlugins = ({
		children,
		allowedDomains = [],
		linkSafetyEnabled = false,
		components,
		...props
	}) => {
		const { effectiveTheme } = useConfig();
		const mermaid = useMemo(
			() =>
				createMermaidPlugin({
					config: {
						theme: effectiveTheme === 'dark' ? 'dark' : 'default'
					}
				}),
			[effectiveTheme]
		);
		const currentHost = window.location.hostname.toLowerCase();
		const normalizedAllowedHosts = [
			currentHost,
			...LINK_SAFETY_ALWAYS_ALLOWED_HOSTS,
			...allowedDomains
				.map(getHostname)
				.filter((domain) => Boolean(domain))
		];

		const linkSafety = {
			enabled: linkSafetyEnabled,
			onLinkCheck: (url) =>
				linkSafetyEnabled
					? isSafeLink(url, normalizedAllowedHosts)
					: false
		};

		return (
			<Streamdown
				{...props}
				components={{ ol: OrderedList, ...components }}
				linkSafety={linkSafety}
				plugins={{
					code,
					mermaid,
					math,
					cjk
				}}
				remarkPlugins={remarkPlugins}
				rehypePlugins={rehypePlugins}
			>
				{children}
			</Streamdown>
		);
	};

	return { default: StreamdownWithPlugins };
});
