// Preserve readable, selectable log content while preventing native controls
// and custom card/chart/tab handlers from changing the historical interface.
export default function FrozenInterface({ children, frozen = true }) {
	const block = (event) => {
		if (frozen) {
			event.preventDefault();
			event.stopPropagation();
		}
	};
	return (
		<fieldset
			disabled={frozen}
			aria-disabled={frozen}
			data-docsbot-ui-frozen={frozen}
			style={{
				border: 0,
				padding: 0,
				margin: 0,
				minWidth: 0,
				width: '100%'
			}}
			onClickCapture={block}
			onFocusCapture={(event) => {
				if (frozen) event.stopPropagation();
			}}
			onPointerDownCapture={(event) => {
				if (
					event.target.closest(
						'a,button,input,textarea,select,[role="button"],[role="tab"],[role="slider"],[role="combobox"],[contenteditable]'
					)
				)
					block(event);
			}}
			onKeyDownCapture={(event) => {
				if (
					[
						'Enter',
						' ',
						'ArrowLeft',
						'ArrowRight',
						'ArrowUp',
						'ArrowDown',
						'Home',
						'End'
					].includes(event.key)
				)
					block(event);
			}}
		>
			{children}
		</fieldset>
	);
}
