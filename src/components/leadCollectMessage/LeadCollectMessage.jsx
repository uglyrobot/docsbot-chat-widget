import { useEffect, useState, useRef } from 'react';
import { useConfig } from '../configContext/ConfigContext';

export const LeadCollectMessage = ({
	payload,
	messageBoxRef,
	onLeadCollectSubmit,
	onLeadCollectCancel
}) => {
	const { labels } = useConfig();
	const [leadFormValues, setLeadFormValues] = useState({});
	const [leadFormTouched, setLeadFormTouched] = useState(false);
	const [isWide, setIsWide] = useState(false);
	const leadMessageRef = useRef(null);

	// Observe the container's own width to toggle 2-column layout
	useEffect(() => {
		const el = leadMessageRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const w = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
				setIsWide(w >= 480);
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const fields =
		Array.isArray(payload.leadForm?.fields) && payload.leadForm.fields.length > 0
			? payload.leadForm.fields
			: [];
	if (fields.length === 0) {
		return null;
	}
	const hasMissingRequired = fields.some(
		(field) =>
			field.required &&
			!String(leadFormValues[field.key] || '').trim()
	);

	useEffect(() => {
		if (!payload?.leadForm?.fields) return;
		const nextValues = {};
		payload.leadForm.fields.forEach((field, index) => {
			const fieldKey = field.key || `field_${index}`;
			const prefillValue = field.isPrefilled ? field.value : undefined;
			const defaultValue =
				field.type === 'color' ? '#000000' : '';
			nextValues[fieldKey] =
				leadFormValues[fieldKey] ??
				(prefillValue !== undefined && prefillValue !== null
					? String(prefillValue)
					: defaultValue);
		});
		setLeadFormValues(nextValues);
	}, [payload?.leadForm?.fields]);

	return (
		<div className="docsbot-chat-lead-message-container">
			<div
				className={`docsbot-chat-lead-message border border-border bg-slate-100 text-slate-800 shadow-sm${isWide ? ' docsbot-lead-wide' : ''}`}
				ref={(node) => {
					leadMessageRef.current = node;
					if (typeof messageBoxRef === 'function') messageBoxRef(node);
					else if (messageBoxRef) messageBoxRef.current = node;
				}}
			>
					<div className="space-y-4 w-full">
						<form
							className="space-y-4 w-full"
							onSubmit={(event) => {
								event.preventDefault();
								if (
									event.currentTarget.reportValidity &&
									!event.currentTarget.reportValidity()
								) {
									return;
								}
								setLeadFormTouched(true);

								const metadata = {};
								fields.forEach((field, index) => {
									if (!field?.key) return;
									const fieldKey = field.key || `field_${index}`;
									const value = leadFormValues[field.key || fieldKey];
									if (
										value !== undefined &&
										value !== null &&
										String(value).trim().length > 0
									) {
										metadata[field.key] = String(value).trim();
									}
								});

								if (typeof onLeadCollectSubmit === 'function') {
									onLeadCollectSubmit({ metadata }, event);
								}
							}}
						>
						<div className="docsbot-lead-fields-grid">
							{fields.map((field, index) => {
								const fieldKey = field.key || `field_${index}`;
								const inputId = `${payload.id}-${fieldKey}`;
								const label =
									field.label ||
									field.name ||
									field.key ||
									`Field ${index + 1}`;
								const inputType = field.type || 'text';
								const fieldValue = leadFormValues[field.key || fieldKey] || '';
								const isLocked = Boolean(field.isPrefilled);
								const normalizedColorValue =
									inputType === 'color' &&
									/^#[0-9a-fA-F]{6}$/.test(fieldValue)
										? fieldValue
										: '#000000';
								const constraintProps = {
									...(field.min !== undefined ? { min: field.min } : {}),
									...(field.max !== undefined ? { max: field.max } : {}),
									...(field.step !== undefined ? { step: field.step } : {}),
									...(field.pattern !== undefined ? { pattern: field.pattern } : {}),
									...(field.minLength !== undefined
										? { minLength: field.minLength }
										: {}),
									...(field.maxLength !== undefined
										? { maxLength: field.maxLength }
										: {}),
									...(field.inputMode !== undefined
										? { inputMode: field.inputMode }
										: {})
								};
								const sharedProps = {
									id: inputId,
									name: field.key || fieldKey,
									required: !!field.required,
									placeholder: field.placeholder || undefined,
									autoComplete: field.autocomplete || undefined,
									className:
										'w-full rounded-lg border border-border bg-background px-3 py-2 text-base sm:text-sm text-slate-800 shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none',
									value:
										inputType === 'color'
											? normalizedColorValue
											: fieldValue,
									disabled: isLocked,
									onChange: (event) => {
										if (isLocked) return;
										setLeadFormTouched(true);
										setLeadFormValues((prev) => ({
											...prev,
											[field.key || fieldKey]: event.target.value
										}));
									}
								};

								const isFullWidth = inputType === 'textarea';

								return (
									<label
										key={inputId}
										htmlFor={inputId}
										className={`block text-sm text-slate-800${isFullWidth ? ' docsbot-lead-field-full' : ''}`}
									>
											<span className="mb-1 block font-semibold">
												{label}
												{field.required && (
													<span
														className="ml-1 text-red-600"
														aria-hidden="true"
													>
														*
													</span>
												)}
											</span>
											{inputType === 'color' ? (
												<>
													<div
														className={`docsbot-color-field rounded-lg border border-border bg-background pl-1.5 pr-3 py-1.5 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
														style={{ width: 'fit-content', maxWidth: '100%' }}
													>
														<div className="flex items-center gap-3">
															<input
																id={inputId}
																name={field.key || fieldKey}
																type="color"
																value={normalizedColorValue}
																disabled={isLocked}
																onChange={(event) => {
																	if (isLocked) return;
																	setLeadFormTouched(true);
																	setLeadFormValues((prev) => ({
																		...prev,
																		[field.key || fieldKey]:
																			event.target.value
																	}));
																}}
																className="docsbot-color-swatch h-7 w-14 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0 disabled:cursor-not-allowed"
															/>
															<span className="whitespace-nowrap text-sm font-mono text-slate-700">
																{normalizedColorValue.toUpperCase()}
															</span>
														</div>
													</div>
													{isLocked && (
														<input
															type="hidden"
															name={field.key || fieldKey}
															value={normalizedColorValue}
														/>
													)}
												</>
										) : inputType === 'textarea' ? (
											<>
												<textarea
														{...sharedProps}
														{...constraintProps}
														rows={field.rows || 2}
														className={sharedProps.className}
													/>
													{isLocked && (
														<input
															type="hidden"
															name={field.key || fieldKey}
															value={fieldValue}
														/>
													)}
												</>
											) : inputType === 'select' ? (
												<>
													<select
														{...sharedProps}
														className={`${sharedProps.className} appearance-none pr-10`}
														style={{
															backgroundImage:
																"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%23475569' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
															backgroundRepeat: 'no-repeat',
															backgroundPosition: 'right 12px center',
															backgroundSize: '16px 16px'
														}}
													>
														{field.placeholder && (
															<option value="" disabled={!!field.required}>
																{field.placeholder}
															</option>
														)}
														{(field.options || []).map((option, optionIndex) => {
															const optionValue =
																typeof option === 'string' ? option : option.value;
															const optionLabel =
																typeof option === 'string'
																	? option
																	: option.label || option.value;
															return (
																<option
																	key={`${inputId}-${optionIndex}`}
																	value={optionValue}
																>
																	{optionLabel}
																</option>
															);
														})}
													</select>
													{isLocked && (
														<input
															type="hidden"
															name={field.key || fieldKey}
															value={fieldValue}
														/>
													)}
												</>
											) : (
												<>
													<input
														{...sharedProps}
														{...constraintProps}
														type={inputType}
														className={sharedProps.className}
													/>
													{isLocked && (
														<input
															type="hidden"
															name={field.key || fieldKey}
															value={fieldValue}
														/>
													)}
												</>
											)}
											{field.help && (
												<span className="mt-1 block text-xs text-muted-foreground">
													{field.help}
												</span>
											)}
										</label>
									);
								})}
							</div>
							<div
								className={`flex items-center gap-3 pt-2 ${
									leadFormTouched && hasMissingRequired
										? 'justify-between'
										: 'justify-end'
								}`}
							>
								{leadFormTouched && hasMissingRequired && (
									<div className="text-xs text-red-700">
										{labels.requiredField ||
											'Please fill out required fields.'}
									</div>
								)}
								<button
									type="submit"
									className="rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
									style={{
										backgroundColor:
											'var(--docsbot-color-main, #1292ee)',
										opacity: hasMissingRequired ? 0.6 : 1,
										cursor: hasMissingRequired ? 'not-allowed' : 'pointer'
									}}
									disabled={hasMissingRequired}
								>
									{labels.continue || 'Continue'}
								</button>
							</div>
						</form>
					</div>
				</div>
			</div>
	);
};
