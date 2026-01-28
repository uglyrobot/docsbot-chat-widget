import React, { lazy } from 'react';

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

	const { Streamdown } = streamdownModule;
	const remarkExternalLinks =
		remarkExternalLinksModule.default || remarkExternalLinksModule;
	const { harden } = hardenModule;
	const code = codeModule.code || codeModule.default;
	const mermaid = mermaidModule.mermaid || mermaidModule.default;
	const math = mathModule.math || mathModule.default;
	const cjk = cjkModule.cjk || cjkModule.default;

	const externalLinksPlugin = [
		remarkExternalLinks,
		{
			target: '_blank',
			rel: ['noopener', 'noreferrer']
		}
	];

	const remarkPlugins = [externalLinksPlugin];

	const rehypePlugins = [
		[
			harden,
			{
				defaultOrigin: window.location.origin,
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
		linkSafety,
		linkSafetyEnabled = false,
		...props
	}) => {
		const currentHost = window.location.hostname.toLowerCase();
		const normalizedAllowedHosts = [
			currentHost,
			...allowedDomains
				.map(getHostname)
				.filter((domain) => Boolean(domain))
		];

		const isLinkSafetyEnabled =
			typeof linkSafety?.enabled === 'boolean'
				? linkSafety.enabled
				: linkSafetyEnabled;
		const baseLinkSafety = {
			enabled: isLinkSafetyEnabled,
			onLinkCheck: (url) =>
				isLinkSafetyEnabled
					? isSafeLink(url, normalizedAllowedHosts)
					: false
		};

		const mergedLinkSafety = linkSafety
			? {
					...baseLinkSafety,
					...linkSafety,
						enabled: isLinkSafetyEnabled,
						onLinkCheck: async (url) => {
							if (!isLinkSafetyEnabled) return false;
							const baseResult = await baseLinkSafety.onLinkCheck(url);
							if (baseResult) return true;
						if (linkSafety.onLinkCheck) {
							return linkSafety.onLinkCheck(url);
						}
						return false;
					}
				}
			: baseLinkSafety;

		return (
			<Streamdown
				{...props}
				linkSafety={mergedLinkSafety}
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
