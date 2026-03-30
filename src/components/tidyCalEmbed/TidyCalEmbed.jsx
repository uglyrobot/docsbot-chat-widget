import { useEffect, useMemo, useRef } from 'react';
import { Loader } from '../loader/Loader';
import { useConfig } from '../configContext/ConfigContext';
import { mergeIdentifyMetadata } from '../../utils/utils';
import {
	resolveTidyCalPath,
	resolveTidyCalUrl
} from '../../utils/tidycal';

const TIDYCAL_BOOKING_COMPLETE_EVENT = 'bookingComplete';

export const TidyCalEmbed = ({
	path,
	hideEventDetail,
	scriptReady,
	onBookingEvent
}) => {
	const containerRef = useRef(null);
	const hostRef = useRef(null);
	const lastEventKeyRef = useRef(null);
	const { identify } = useConfig();
	const embedPath = useMemo(() => resolveTidyCalPath(path), [path]);
	const embedUrl = useMemo(() => resolveTidyCalUrl(path), [path]);
	const prefill = useMemo(() => {
		const metadata = mergeIdentifyMetadata(identify);
		return {
			name:
				typeof metadata?.name === 'string' && metadata.name.trim()
					? metadata.name.trim()
					: '',
			email:
				typeof metadata?.email === 'string' && metadata.email.trim()
					? metadata.email.trim()
					: ''
		};
	}, [identify]);

	useEffect(() => {
		if (
			!scriptReady ||
			!embedPath ||
			!containerRef.current ||
			!window.TidyCal
		) {
			return;
		}

		containerRef.current.innerHTML = '';
		const host = document.createElement('div');
		host.className = 'tidycal-embed';
		host.dataset.path = embedPath;
		if (hideEventDetail) {
			host.dataset.showavatar = 'false';
		}
		if (prefill.name) {
			host.dataset.name = prefill.name;
		}
		if (prefill.email) {
			host.dataset.email = prefill.email;
		}
		containerRef.current.appendChild(host);
		hostRef.current = host;

		try {
			window.TidyCal.init(host);
		} catch (error) {
			console.warn('DOCSBOT: Failed to initialize TidyCal embed', error);
		}

		return () => {
			hostRef.current = null;
			if (containerRef.current) {
				containerRef.current.innerHTML = '';
			}
		};
	}, [embedPath, hideEventDetail, prefill, scriptReady]);

	useEffect(() => {
		if (!embedUrl || typeof onBookingEvent !== 'function') return;

		const handleMessage = (event) => {
			// TidyCal's booking page posts `bookingComplete` to `window.top`, but uses
			// the iframe page origin (`https://tidycal.com`) as targetOrigin. On
			// cross-origin embeds the browser drops that message before it reaches the
			// host page, so client-side booking metadata capture is not reliable here.
			if (event.origin !== 'https://tidycal.com') {
				return;
			}

			const iframe = containerRef.current?.querySelector('iframe');
			if (!iframe || event.source !== iframe.contentWindow) {
				return;
			}

			const eventName = event.data?.event;
			if (eventName !== TIDYCAL_BOOKING_COMPLETE_EVENT) {
				return;
			}

			const payload = event.data;
			const eventKey = JSON.stringify({
				eventName,
				payload
			});
			if (eventKey === lastEventKeyRef.current) {
				return;
			}
			lastEventKeyRef.current = eventKey;

			onBookingEvent({
				eventName,
				payload,
				url: embedUrl
			});
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [embedUrl, onBookingEvent]);

	return (
		<div className="docsbot-scheduler-embed-container">
			<div
				className={`docsbot-scheduler-embed-shell docsbot-tidycal-embed-shell${
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
					className="docsbot-tidycal-embed docsbot-scheduler-embed-body"
					aria-label="TidyCal scheduling widget"
				/>
			</div>
		</div>
	);
};
