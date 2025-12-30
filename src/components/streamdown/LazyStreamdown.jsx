import React, { lazy } from 'react';

export const LazyStreamdown = lazy(async () => {
	const [streamdownModule, remarkExternalLinksModule] = await Promise.all([
		import('streamdown'),
		import('remark-external-links')
	]);

	const { Streamdown, defaultRemarkPlugins } = streamdownModule;
	const remarkExternalLinks =
		remarkExternalLinksModule.default || remarkExternalLinksModule;

	const externalLinksPlugin = [
		remarkExternalLinks,
		{
			target: '_blank',
			rel: ['noopener', 'noreferrer']
		}
	];

	const resolvedPlugins = defaultRemarkPlugins
		? Object.values(defaultRemarkPlugins)
		: [];
	const plugins = [...resolvedPlugins, externalLinksPlugin];

	const StreamdownWithPlugins = ({ children, ...props }) => (
		<Streamdown {...props} remarkPlugins={plugins}>
			{children}
		</Streamdown>
	);

	return { default: StreamdownWithPlugins };
});
