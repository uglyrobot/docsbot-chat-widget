import { useState } from 'react';
import { useConfig } from '../configContext/ConfigContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
	faFileInvoiceDollar,
	faBoxOpen,
	faChevronDown,
	faChevronUp,
	faArrowUpRightFromSquare,
	faDownload,
	faCheckCircle,
	faTimesCircle,
	faExclamationCircle,
	faClock
} from '@fortawesome/free-solid-svg-icons';

const formatCurrency = (amount, currency) => {
	if (amount === undefined || amount === null) return '';
	// Using undefined for locale uses the browser's default locale.
	return new Intl.NumberFormat(undefined, {
		style: 'currency',
		currency: currency || 'usd',
	}).format(amount);
};

const formatDate = (dateString) => {
	if (!dateString) return '';
	try {
		// Using undefined for locale uses the browser's default locale.
		// The Date object automatically converts the UTC time to the user's local timezone.
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		}).format(new Date(dateString));
	} catch (e) {
		return dateString;
	}
};

/** Maps Stripe invoice/subscription status enum to `stripeStatus*` label keys. */
const stripeStatusLabel = (status, labels) => {
	if (!status || typeof status !== 'string') return '';
	const camel = status.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
	const key = `stripeStatus${camel.charAt(0).toUpperCase() + camel.slice(1)}`;
	const translated = labels[key];
	if (translated) return translated;
	return status.replace(/_/g, ' ');
};

const getStatusColor = (status) => {
	switch (status?.toLowerCase()) {
		case 'paid':
		case 'active':
			return 'bg-emerald-100 text-emerald-800 border-emerald-200';
		case 'open':
		case 'past_due':
		case 'past_due_unresolved':
		case 'unpaid':
		case 'incomplete':
			return 'bg-amber-100 text-amber-800 border-amber-200';
		case 'void':
		case 'uncollectible':
		case 'canceled':
		case 'incomplete_expired':
			return 'bg-rose-100 text-rose-800 border-rose-200';
		case 'draft':
		case 'trialing':
		case 'paused':
			return 'bg-slate-100 text-slate-800 border-slate-200';
		default:
			return 'bg-slate-100 text-slate-800 border-slate-200';
	}
};

const getStatusIcon = (status) => {
	switch (status?.toLowerCase()) {
		case 'paid':
		case 'active':
			return faCheckCircle;
		case 'open':
		case 'past_due':
		case 'past_due_unresolved':
		case 'unpaid':
		case 'incomplete':
			return faExclamationCircle;
		case 'void':
		case 'uncollectible':
		case 'canceled':
		case 'incomplete_expired':
			return faTimesCircle;
		default:
			return faClock;
	}
};

const InvoiceItem = ({ invoice, labels }) => {
	const [expanded, setExpanded] = useState(false);

	const displayAmount = parseFloat(invoice.amountDue) > 0 ? invoice.amountDue : invoice.amountPaid;
	
	// Determine if the invoice is paid, unpaid, or partially paid
	const isPaid = invoice.status?.toLowerCase() === 'paid';
	const amountDue = parseFloat(invoice.amountDue) || 0;
	const amountPaid = parseFloat(invoice.amountPaid) || 0;
	
	// Determine what amount to show based on status
	let amountLabel = labels.stripeAmount;
	let amountValue = displayAmount;
	
	if (!isPaid && amountDue > 0) {
		amountLabel = labels.stripeAmountDue;
		amountValue = invoice.amountDue;
	} else if (isPaid) {
		amountLabel = labels.stripeAmountPaid;
		amountValue = invoice.amountPaid;
	}

	return (
		<div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm min-w-0 w-full">
			<div className="p-3 sm:p-4">
				<div className="flex justify-between items-start mb-2 gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<FontAwesomeIcon icon={faFileInvoiceDollar} className="text-slate-400 w-4 h-4 shrink-0" />
						<span className="font-semibold text-slate-800 text-sm sm:text-base truncate">
							{labels.stripeInvoice} {invoice.invoiceNumber || invoice.id}
						</span>
					</div>
					<span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border flex items-center justify-center gap-1.5 ${getStatusColor(invoice.status)}`}>
						<FontAwesomeIcon icon={getStatusIcon(invoice.status)} className="w-3 h-3" />
						<span>{stripeStatusLabel(invoice.status, labels)}</span>
					</span>
				</div>

				<div className="grid grid-cols-2 gap-2 text-sm text-slate-600 mb-3">
					<div className="min-w-0">
						<span className="block text-xs text-slate-400 truncate">{amountLabel}</span>
						<span className="font-medium text-slate-800 truncate block">{formatCurrency(amountValue, invoice.currency)}</span>
					</div>
					<div className="min-w-0">
						<span className="block text-xs text-slate-400 truncate">{labels.stripeDate}</span>
						<span className="truncate block">{formatDate(invoice.createdAt)}</span>
					</div>
				</div>

				<div className="flex flex-wrap gap-2 mt-3">
					{invoice.hostedInvoiceUrl && (
						<a
							href={invoice.hostedInvoiceUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded transition-colors max-w-full"
						>
							<FontAwesomeIcon icon={faArrowUpRightFromSquare} className="w-3 h-3 shrink-0" />
							<span className="truncate">{labels.stripeViewInvoice}</span>
						</a>
					)}
					{invoice.invoicePdf && (
						<a
							href={invoice.invoicePdf}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center justify-center w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors shrink-0"
							title="Download PDF"
							aria-label="Download PDF"
						>
							<FontAwesomeIcon icon={faDownload} className="w-3.5 h-3.5" />
						</a>
					)}
				</div>
			</div>

			{invoice.lineItems && invoice.lineItems.length > 0 && (
				<div className="border-t border-slate-100 bg-slate-50">
					<button
						onClick={() => setExpanded(!expanded)}
						className="w-full px-4 py-2 flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none"
					>
						<span className="truncate pr-2">{expanded ? labels.stripeHideLineItems : labels.stripeViewLineItems?.replace('{count}', invoice.lineItems.length)}</span>
						<FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} className="w-3 h-3 shrink-0" />
					</button>

					{expanded && (
						<div className="px-4 pb-3 pt-1 space-y-2">
							{invoice.lineItems.map((item, idx) => (
								<div key={idx} className="flex justify-between items-start text-sm border-b border-slate-200 last:border-0 pb-2 last:pb-0 gap-3">
									<div className="min-w-0 flex-1">
										<div className="text-slate-800 font-medium truncate">{item.description || labels.stripeItem}</div>
										<div className="text-slate-500 text-xs truncate">{labels.stripeQty}: {item.quantity}</div>
									</div>
									<div className="text-slate-800 font-medium whitespace-nowrap shrink-0">
										{formatCurrency(item.amount, item.currency)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
};

const SubscriptionItem = ({ subscription, labels }) => {
	const startDate = formatDate(subscription.currentPeriodStartAt);
	const endDate = formatDate(subscription.currentPeriodEndAt);
	let periodText = '';
	if (startDate && endDate) {
		periodText = `${startDate} - ${endDate}`;
	} else if (endDate) {
		periodText = endDate;
	} else if (startDate) {
		periodText = startDate;
	}

	let totalAmount = 0;
	let mainInterval = null;
	let mainIntervalCount = 1;
	let currency = subscription.currency || 'usd';
	let hasValidAmount = false;

	if (subscription.items && subscription.items.length > 0) {
		subscription.items.forEach(item => {
			if (item.unitAmount != null) {
				totalAmount += (item.unitAmount / 100) * (item.quantity || 1);
				hasValidAmount = true;
			}
			if (!mainInterval && item.recurringInterval) {
				mainInterval = item.recurringInterval;
				mainIntervalCount = item.recurringIntervalCount || 1;
			}
			if (item.currency) {
				currency = item.currency;
			}
		});
	}

	let intervalStr = '';
	if (mainInterval) {
		if (mainIntervalCount === 1) {
			const intervalLabel = labels[`stripeInterval${mainInterval.charAt(0).toUpperCase() + mainInterval.slice(1)}`];
			intervalStr = `/${intervalLabel || mainInterval}`;
		} else {
			const intervalLabelPlural = labels[`stripeInterval${mainInterval.charAt(0).toUpperCase() + mainInterval.slice(1)}s`];
			intervalStr = ` / ${mainIntervalCount} ${intervalLabelPlural || mainInterval + 's'}`;
		}
	}

	return (
		<div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm min-w-0 w-full">
			<div className="p-3 sm:p-4">
				<div className="flex justify-between items-start mb-3 gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<FontAwesomeIcon icon={faBoxOpen} className="text-slate-400 w-4 h-4 shrink-0" />
						<span className="font-semibold text-slate-800 text-sm sm:text-base truncate">
							{labels.stripeSubscription}
						</span>
					</div>
					<span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border flex items-center justify-center gap-1.5 ${getStatusColor(subscription.status)}`}>
						<FontAwesomeIcon icon={getStatusIcon(subscription.status)} className="w-3 h-3" />
						<span>{stripeStatusLabel(subscription.status, labels)}</span>
					</span>
				</div>

				<div className="grid grid-cols-2 gap-3 text-sm text-slate-600 mb-3">
					{periodText && (
						<div className="col-span-2 sm:col-span-1 min-w-0">
							<span className="block text-xs text-slate-400 truncate">{labels.stripeCurrentPeriod}</span>
							<span className="font-medium text-slate-800 truncate block">{periodText}</span>
						</div>
					)}
					{subscription.trialEndAt && (
						<div className="col-span-2 sm:col-span-1 min-w-0">
							<span className="block text-xs text-slate-400 truncate">{labels.stripeTrialEnds}</span>
							<span className="font-medium text-slate-800 truncate block">
								{formatDate(subscription.trialEndAt)}
								{subscription.trialDaysRemaining != null && (
									<span className="text-slate-500 font-normal ml-1">
										({subscription.trialDaysRemaining} {subscription.trialDaysRemaining === 1 ? labels.stripeTrialDayLeft : labels.stripeTrialDaysLeft})
									</span>
								)}
							</span>
						</div>
					)}
					{hasValidAmount && (
						<div className="col-span-2 sm:col-span-1 min-w-0">
							<span className="block text-xs text-slate-400 truncate">{labels.stripeAmount}</span>
							<span className="font-medium text-slate-800 truncate block">
								{formatCurrency(totalAmount, currency)}{intervalStr}
							</span>
						</div>
					)}
					{subscription.cancelAtPeriodEnd && (
						<div className="col-span-2">
							<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200 max-w-full">
								<FontAwesomeIcon icon={faExclamationCircle} className="w-3 h-3 shrink-0" />
								<span className="truncate">{labels.stripeCancelsAtPeriodEnd}</span>
							</span>
						</div>
					)}
				</div>

				{subscription.items && subscription.items.length > 0 && (
					<div className="mt-3 pt-3 border-t border-slate-100">
						<div className="space-y-2">
							{subscription.items.map((item, idx) => {
								const itemAmount = item.unitAmount != null ? (item.unitAmount / 100) : null;
								return (
									<div key={idx} className="flex justify-between items-start text-sm bg-slate-50 px-3 py-2 rounded gap-3">
										<div className="min-w-0 flex-1">
											<span className="text-slate-800 font-medium truncate block">{item.planName || labels.stripeItem}</span>
											<span className="text-slate-500 text-xs truncate block">{labels.stripeQty}: {item.quantity}</span>
										</div>
										{itemAmount !== null && (
											<div className="text-slate-800 font-medium whitespace-nowrap shrink-0">
												{formatCurrency(itemAmount, item.currency || currency)}
											</div>
										)}
									</div>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export const StripeBilling = ({ data }) => {
	const { labels } = useConfig();

	if (!data || !Array.isArray(data) || data.length === 0) return null;

	return (
		<div className="mt-2 mb-1 w-full flex flex-col gap-2">
			{data.map((group, groupIdx) => {
				if (!group.items || group.items.length === 0) return null;

				return (
					<div key={groupIdx} className="w-full">
						{group.type === 'invoices' && (
							<div className="space-y-2">
								{group.items.map((invoice, idx) => (
									<InvoiceItem key={invoice.id || idx} invoice={invoice} labels={labels || {}} />
								))}
							</div>
						)}
						{group.type === 'subscriptions' && (
							<div className="space-y-2">
								{group.items.map((subscription, idx) => (
									<SubscriptionItem key={subscription.id || idx} subscription={subscription} labels={labels || {}} />
								))}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
};
