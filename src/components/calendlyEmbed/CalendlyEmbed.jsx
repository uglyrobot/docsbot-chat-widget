import { useEffect, useMemo, useRef } from 'react';
import { Loader } from '../loader/Loader';
import { useConfig } from '../configContext/ConfigContext';
import { buildCalendlyEmbedUrl, resolveCalendlyUrl } from '../../utils/calendly';
import { mergeIdentifyMetadata } from '../../utils/utils';

const CALENDLY_BOOKED_EVENT = 'calendly.event_scheduled';

export const CalendlyEmbed = ({
	path,
	hideEventDetails,
	hideCookieBanner,
	scriptReady,
	onBookingScheduled
}) => {
	const { color, identify } = useConfig();
	const containerRef = useRef(null);
	const lastEventKeyRef = useRef(null);
	const latestIdentifyRef = useRef(identify);
	const initialPrefillRef = useRef(createCalendlyPrefill(identify));

	latestIdentifyRef.current = identify;

	const baseUrl = useMemo(() => resolveCalendlyUrl(path), [path]);
	const embedUrl = useMemo(
		() =>
			buildCalendlyEmbedUrl(path, {
				primaryColor: color || '#1292EE',
				backgroundColor: '#ffffff',
				textColor: '#314351'
			}, {
				hideEventDetails,
				hideCookieBanner
			}),
		[path, color, hideEventDetails, hideCookieBanner]
	);
	useEffect(() => {
		lastEventKeyRef.current = null;
		initialPrefillRef.current = createCalendlyPrefill(
			latestIdentifyRef.current
		);
	}, [path]);

	useEffect(() => {
		if (!scriptReady || !embedUrl || !containerRef.current || !window.Calendly) {
			return;
		}

		containerRef.current.innerHTML = '';
		window.Calendly.initInlineWidget({
			url: embedUrl,
			parentElement: containerRef.current,
			prefill: initialPrefillRef.current,
			resize: true
		});

		return () => {
			if (containerRef.current) {
				containerRef.current.innerHTML = '';
			}
		};
	}, [embedUrl, scriptReady]);

	useEffect(() => {
		if (!baseUrl || typeof onBookingScheduled !== 'function') return;

		const handleMessage = (event) => {
			if (event.origin !== 'https://calendly.com') {
				return;
			}

			const iframe = containerRef.current?.querySelector('iframe');
			if (!iframe || event.source !== iframe.contentWindow) {
				return;
			}

			const eventName = event.data?.event;
			if (
				typeof eventName !== 'string' ||
				!eventName.startsWith('calendly.')
			) {
				return;
			}

			const payload = event.data?.payload || null;
			console.log('Calendly Event:', eventName);
			console.log('Event Details:', payload);
			console.log('Calendly Raw Event:', event.data);

			if (eventName !== CALENDLY_BOOKED_EVENT) {
				return;
			}

			const eventKey = JSON.stringify({ event: eventName, payload });
			if (eventKey === lastEventKeyRef.current) {
				return;
			}
			lastEventKeyRef.current = eventKey;

			onBookingScheduled({
				eventName,
				payload,
				url: baseUrl,
				path
			});
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [baseUrl, onBookingScheduled, path]);

	return (
		<div className="docsbot-scheduler-embed-container">
			<div
				className={`docsbot-scheduler-embed-shell docsbot-calendly-embed-shell${
					!scriptReady ? ' is-loading' : ''
				}`}
			>
				{!scriptReady && (
					<div className="docsbot-scheduler-embed-loading">
						<Loader />
					</div>
				)}
				<div
					ref={containerRef}
					className="docsbot-calendly-embed docsbot-scheduler-embed-body"
					aria-label="Calendly scheduling widget"
				/>
			</div>
		</div>
	);
};

function createCalendlyPrefill(identify) {
	const metadata = mergeIdentifyMetadata(identify);
	const result = {};

	if (typeof metadata?.name === 'string' && metadata.name.trim()) {
		result.name = metadata.name.trim();
	}
	if (typeof metadata?.email === 'string' && metadata.email.trim()) {
		result.email = metadata.email.trim();
	}

	return Object.keys(result).length > 0 ? result : undefined;
}
