import { useEffect, useRef } from 'react';

export const ImageLightbox = ({
	image,
	closeLabel = 'Close',
	onClose,
	triggerElement
}) => {
	const dialogRef = useRef(null);
	const closeButtonRef = useRef(null);

	useEffect(() => {
		if (!image) return undefined;

		const previouslyFocusedElement =
			triggerElement || document.activeElement;
		const focusFrame = window.requestAnimationFrame(() => {
			closeButtonRef.current?.focus();
		});

		const getFocusableElements = () =>
			Array.from(
				dialogRef.current?.querySelectorAll(
					'button:not([disabled]):not([tabindex="-1"]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
				) || []
			);

		const handleKeyDown = (event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				onClose();
				return;
			}

			if (event.key !== 'Tab') return;

			const focusableElements = getFocusableElements();
			if (focusableElements.length === 0) {
				event.preventDefault();
				closeButtonRef.current?.focus();
				return;
			}

			const firstElement = focusableElements[0];
			const lastElement = focusableElements[focusableElements.length - 1];
			if (!dialogRef.current?.contains(document.activeElement)) {
				event.preventDefault();
				firstElement.focus();
			} else if (event.shiftKey && document.activeElement === firstElement) {
				event.preventDefault();
				lastElement.focus();
			} else if (
				!event.shiftKey &&
				document.activeElement === lastElement
			) {
				event.preventDefault();
				firstElement.focus();
			}
		};

		document.addEventListener('keydown', handleKeyDown, true);

		return () => {
			window.cancelAnimationFrame(focusFrame);
			document.removeEventListener('keydown', handleKeyDown, true);
			if (previouslyFocusedElement?.isConnected) {
				window.requestAnimationFrame(() => {
					previouslyFocusedElement.focus?.();
				});
			}
		};
	}, [image, onClose, triggerElement]);

	if (!image) return null;

	return (
		<div
			ref={dialogRef}
			className="docsbot-image-lightbox"
			role="dialog"
			aria-modal="true"
			aria-label={image.alt || image.title || image.src}
		>
			<button
				type="button"
				className="docsbot-image-lightbox-backdrop"
				aria-label={closeLabel}
				tabIndex={-1}
				onClick={onClose}
			/>
			<div className="docsbot-image-lightbox-panel">
				<button
					ref={closeButtonRef}
					type="button"
					className="docsbot-image-lightbox-close"
					onClick={onClose}
				>
					<span aria-hidden="true">×</span>
					<span>{closeLabel}</span>
				</button>
				<img
					className="docsbot-image-lightbox-image"
					src={image.src}
					alt={image.alt || ''}
					title={image.title}
				/>
			</div>
		</div>
	);
};
