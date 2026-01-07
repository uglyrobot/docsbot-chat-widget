import React, { lazy } from 'react';

export const LazyStreamdown = lazy(async () => {
	const [streamdownModule, remarkExternalLinksModule, hardenModule] = await Promise.all([
		import('streamdown'),
		import('remark-external-links'),
		import('rehype-harden')
	]);

	const { Streamdown, defaultRemarkPlugins, defaultRehypePlugins } = streamdownModule;
	const remarkExternalLinks =
		remarkExternalLinksModule.default || remarkExternalLinksModule;
	const { harden } = hardenModule;

	const externalLinksPlugin = [
		remarkExternalLinks,
		{
			target: '_blank',
			rel: ['noopener', 'noreferrer']
		}
	];

	const resolvedRemarkPlugins = defaultRemarkPlugins
		? Object.values(defaultRemarkPlugins)
		: [];
	const remarkPlugins = [...resolvedRemarkPlugins, externalLinksPlugin];

	const resolvedRehypePlugins = defaultRehypePlugins
		? Object.entries(defaultRehypePlugins)
			.filter(([key]) => key !== 'raw') // Exclude raw HTML support for security
			.map(([, value]) => value)
		: [];
	const rehypePlugins = [
		...resolvedRehypePlugins,
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

	const StreamdownWithPlugins = ({ children, ...props }) => (
		<Streamdown {...props} remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
			{children}
		</Streamdown>
	);

	return { default: StreamdownWithPlugins };
});
