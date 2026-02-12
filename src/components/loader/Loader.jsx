export const Loader = ({
	showSearchIndicator = false,
	searchLabel = 'Searching documentation'
}) => {
	return (
		<div className="chatbot-loader-container">
			{showSearchIndicator ? (
				<span
					className="docsbot-search-loader-icon"
					aria-hidden="true"
				>
					<svg
						className="docsbot-search-loader-svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<rect
							className="docsbot-search-doc"
							x="3.5"
							y="2.5"
							width="11"
							height="14"
							rx="2"
						/>
						<line
							className="docsbot-search-line"
							x1="6"
							y1="7"
							x2="11.5"
							y2="7"
						/>
						<line
							className="docsbot-search-line"
							x1="6"
							y1="10"
							x2="10"
							y2="10"
						/>
						<circle
							className="docsbot-search-pulse-ring"
							cx="15.5"
							cy="14.5"
							r="6.2"
						/>
						<circle
							className="docsbot-search-lens"
							cx="15.5"
							cy="14.5"
							r="4"
						/>
						<line
							className="docsbot-search-handle"
							x1="18.5"
							y1="17.5"
							x2="21.5"
							y2="20.5"
						/>
					</svg>
					<span className="docsbot-screen-reader-only">
						{searchLabel}
					</span>
				</span>
			) : null}
			<svg
				id="dots"
				width="50px"
				height="21px"
				viewBox="0 0 132 58"
				version="1.1"
				xmlns="http://www.w3.org/2000/svg"
			>
				<g stroke="none" fill="none">
					<g id="chatbot-loader" fill="currentColor">
						<circle
							id="chatbot-loader-dot1"
							cx="25"
							cy="30"
							r="13"
						></circle>
						<circle
							id="chatbot-loader-dot2"
							cx="65"
							cy="30"
							r="13"
						></circle>
						<circle
							id="chatbot-loader-dot3"
							cx="105"
							cy="30"
							r="13"
						></circle>
					</g>
				</g>
			</svg>
		</div>
	);
};
