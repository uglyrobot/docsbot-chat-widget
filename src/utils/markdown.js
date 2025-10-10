import { defaultRemarkPlugins } from 'streamdown';
import remarkExternalLinks from 'remark-external-links';

const externalLinksPlugin = [
        remarkExternalLinks,
        {
                target: '_blank',
                rel: ['noopener', 'noreferrer']
        }
];

export const streamdownRemarkPlugins = [
        ...defaultRemarkPlugins,
        externalLinksPlugin
];
