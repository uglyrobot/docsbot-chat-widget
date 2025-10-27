export const mergeIdentifyMetadata = (identify) => {
        if (!identify || typeof identify !== 'object') {
                return {};
        }

        const baseMetadata = {
                ...(identify.metadata && typeof identify.metadata === 'object'
                        ? identify.metadata
                        : {}),
                ...identify
        };

        if (Object.prototype.hasOwnProperty.call(baseMetadata, 'metadata')) {
                delete baseMetadata.metadata;
        }

        return baseMetadata;
};
