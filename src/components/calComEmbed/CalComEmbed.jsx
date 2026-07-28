import {
	lazy,
	Suspense,
	useEffect,
	useMemo,
	useRef
} from 'react';
import { Loader } from '../loader/Loader';
import { useConfig } from '../configContext/ConfigContext';
import { resolveCalComLink, resolveCalComUrl } from '../../utils/calcom';
import { mergeIdentifyMetadata } from '../../utils/utils';
import { getWidgetThemePalette } from '../../utils/widgetTheme.mjs';

const LazyCal = lazy(() => import('@calcom/embed-react'));

export const CalComEmbed = ({
	path,
	hideEventDetails,
	messageId,
	onBookingSuccessful
}) => {
	const lastBookingKeyRef = useRef(null);
	const unsubscribeRef = useRef(null);
	const { color, identify, effectiveTheme } = useConfig();
	const themePalette = useMemo(
		() => getWidgetThemePalette(effectiveTheme),
		[effectiveTheme]
	);

	const calLink = useMemo(() => resolveCalComLink(path), [path]);
	const calUrl = useMemo(() => resolveCalComUrl(path), [path]);
	const namespace = useMemo(
		() => `docsbot-${String(messageId || 'cal').replace(/[^a-z0-9_-]/gi, '')}`,
		[messageId]
	);
	const embedConfig = useMemo(() => {
		const metadata = mergeIdentifyMetadata(identify);
		const config = {};

		if (typeof metadata?.name === 'string' && metadata.name.trim()) {
			config.name = metadata.name.trim();
		}
		if (typeof metadata?.email === 'string' && metadata.email.trim()) {
			config.email = metadata.email.trim();
		}

		return config;
	}, [identify]);

	useEffect(() => {
		if (!calLink || typeof onBookingSuccessful !== 'function') return;

		let cancelled = false;
		const handleBookingSuccessful = (detail) => {
			const payload = detail?.data || null;
			console.log('Cal.com Event:', detail?.type || 'bookingSuccessfulV2');
			console.log('Event Details:', payload);
			console.log('Cal.com Raw Event:', detail);

			const bookingKey = JSON.stringify({
				type: detail?.type || null,
				uid: payload?.uid || null,
				startTime: payload?.startTime || null,
				endTime: payload?.endTime || null
			});
			if (bookingKey === lastBookingKeyRef.current) {
				return;
			}
			lastBookingKeyRef.current = bookingKey;

			onBookingSuccessful({
				eventName: detail?.type || 'bookingSuccessfulV2',
				payload,
				url: calUrl
			});
		};

		(async () => {
			try {
				const { getCalApi } = await import('@calcom/embed-react');
				if (cancelled) return;
				const cal = await getCalApi({ namespace });
				if (cancelled || !cal) return;
				const brandColor = color || '#1292EE';
				const runCalInstruction = (method, arg) => {
					if (typeof cal === 'function') {
						cal(method, arg);
						return;
					}
					if (method === 'ui' && typeof cal.ui === 'function') {
						cal.ui(arg);
						return;
					}
					if (method === 'on' && typeof cal.on === 'function') {
						cal.on(arg);
						return;
					}
					if (method === 'off' && typeof cal.off === 'function') {
						cal.off(arg);
					}
				};

				runCalInstruction('ui', {
					theme: effectiveTheme,
					hideEventTypeDetails: Boolean(hideEventDetails),
					cssVarsPerTheme: {
						[effectiveTheme]: {
							'cal-brand': brandColor
						}
					}
				});

				const bookingHandler = (event) => {
					handleBookingSuccessful(event?.detail || null);
				};
				const rescheduleHandler = (event) => {
					handleBookingSuccessful(event?.detail || null);
				};

				runCalInstruction('on', {
					action: 'bookingSuccessfulV2',
					callback: bookingHandler
				});
				runCalInstruction('on', {
					action: 'rescheduleBookingSuccessfulV2',
					callback: rescheduleHandler
				});

				unsubscribeRef.current = () => {
					runCalInstruction('off', {
						action: 'bookingSuccessfulV2',
						callback: bookingHandler
					});
					runCalInstruction('off', {
						action: 'rescheduleBookingSuccessfulV2',
						callback: rescheduleHandler
					});
				};
			} catch (error) {
				console.warn('DOCSBOT: Failed to initialize Cal.com embed', error);
			}
		})();

		return () => {
			cancelled = true;
			unsubscribeRef.current?.();
			unsubscribeRef.current = null;
		};
	}, [
		calLink,
		calUrl,
		color,
		effectiveTheme,
		hideEventDetails,
		namespace,
		onBookingSuccessful
	]);

	if (!calLink) return null;

	return (
		<div
			className="docsbot-scheduler-embed-container"
			style={{
				'--cal-brand-color': color || '#1292EE',
				'--cal-bg': themePalette.backgroundColor,
				'--cal-bg-muted': themePalette.mutedSurfaceColor,
				'--cal-bg-emphasis': themePalette.surfaceColor,
				'--cal-border-muted': themePalette.borderColor,
				'--cal-border-subtle': themePalette.borderColor,
				'--cal-text': themePalette.textColor,
				'--cal-text-muted': themePalette.mutedTextColor,
				'--cal-text-subtle': themePalette.mutedTextColor,
				'--cal-text-emphasis': themePalette.textColor
			}}
		>
			<div className="docsbot-scheduler-embed-shell docsbot-calcom-embed-shell">
				<Suspense
					fallback={
						<div className="docsbot-scheduler-embed-loading">
							<Loader />
						</div>
					}
				>
						<LazyCal
							calLink={calLink}
							namespace={namespace}
							config={embedConfig}
							className="docsbot-calcom-embed"
							style={{ width: '100%' }}
						/>
				</Suspense>
			</div>
		</div>
	);
};
