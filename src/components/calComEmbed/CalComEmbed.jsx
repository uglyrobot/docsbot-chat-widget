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

const LazyCal = lazy(() => import('@calcom/embed-react'));

export const CalComEmbed = ({
	path,
	hideEventDetails,
	messageId,
	onBookingSuccessful
}) => {
	const lastBookingKeyRef = useRef(null);
	const unsubscribeRef = useRef(null);
	const { color, identify } = useConfig();

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
					theme: 'light',
					hideEventTypeDetails: Boolean(hideEventDetails),
					cssVarsPerTheme: {
						light: {
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
				'--cal-bg': '#ffffff',
				'--cal-bg-muted': '#f8fafc',
				'--cal-bg-emphasis': '#f1f5f9',
				'--cal-border-muted': '#e2e8f0',
				'--cal-border-subtle': '#cbd5e1',
				'--cal-text': '#314351',
				'--cal-text-muted': '#64748b',
				'--cal-text-subtle': '#475569',
				'--cal-text-emphasis': '#0f172a'
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
