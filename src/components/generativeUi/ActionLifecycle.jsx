import React, { createContext, useContext, useRef, useState } from 'react';
import { defineComponent } from '@openuidev/react-lang';
import { z } from 'zod/v4';
import FrozenInterface from './FrozenInterface';
import { actionValuesFingerprint as fingerprint } from './actionLifecycleState.mjs';

const Lifecycle = createContext(null);
const GroupNesting = createContext(false);
const empty = { groups: {}, formState: {} };

export function ActionLifecycleProvider({
	children,
	initialState,
	onSave,
	send,
	requestPending = false,
	readOnly = false
}) {
	const [state, setState] = useState(() =>
		initialState
			? {
					...initialState,
					groups: Object.fromEntries(
						Object.entries(initialState.groups || {}).map(
							([name, value]) => [
								name,
								value.status === 'pending'
									? { ...value, status: 'retry' }
									: value
							]
						)
					)
				}
			: empty
	);
	const stateRef = useRef(state);
	const active = useRef(null);
	const busy = useRef(false);
	const fields = useRef(state.formState || {});
    const formStateSnapshot = useRef(JSON.stringify(state.formState || {}));
	const saveRef = useRef(onSave);
	saveRef.current = onSave;
	const update = (next) => {
		stateRef.current = next;
		setState(next);
		saveRef.current?.(next);
	};
	const onStateUpdate = (value) => {
		fields.current = value;
		const groups = stateRef.current.groups || {};
		let changed = false;
		const next = Object.fromEntries(
			Object.entries(groups).map(([name, group]) => {
				const dirty =
					group.hasForm &&
					group.fingerprint !== fingerprint(value, group.formName);
				if (Boolean(dirty) !== Boolean(group.dirty)) {
					changed = true;
					return [name, { ...group, dirty }];
				}
				return [name, group];
			})
		);
		const serialized = JSON.stringify(value || {});
        if (changed || formStateSnapshot.current !== serialized) {
            formStateSnapshot.current = serialized;
            update({ ...stateRef.current, groups: next, formState: JSON.parse(serialized) });
        }
	};
	const onAction = async (event) => {
		if (readOnly || requestPending || busy.current) return;
		const group = active.current;
		const previous = group && stateRef.current.groups?.[group.name];
		if (
			previous?.status === 'submitted' &&
			(group.policy === 'once' ||
				(group.hasForm &&
					previous.fingerprint ===
						fingerprint(fields.current, previous.formName)))
		)
			return;
		busy.current = true;
		const setStatus = (status) => {
			if (!group) return;
			update({
				groups: {
					...stateRef.current.groups,
					[group.name]: {
						status,
						policy: group.policy,
						hasForm: group.hasForm,
						formName: event.formName,
						fingerprint: fingerprint(
							fields.current,
							event.formName
						),
						dirty: false
					}
				},
				formState: fields.current
			});
		};
		setStatus('pending');
		try {
			const result = await send(event, group);
			setStatus(
				result === true
					? 'submitted'
					: result === 'cancelled'
						? 'ready'
						: 'retry'
			);
		} catch {
			setStatus('retry');
		} finally {
			busy.current = false;
		}
	};
	const api = {
		state,
		active,
		fields,
		onStateUpdate,
		onAction,
		readOnly,
		requestPending
	};
	return (
		<Lifecycle.Provider value={api}>
			<div
				onClickCapture={() => {
					active.current = null;
				}}
				onKeyDownCapture={() => {
					active.current = null;
				}}
			>
				{children(api)}
			</div>
		</Lifecycle.Provider>
	);
}

function Group({ props, renderNode }) {
	const lifecycle = useContext(Lifecycle);
	const nested = useContext(GroupNesting);
	const ref = useRef(null);
	const state = lifecycle?.state.groups?.[props.name];
	const status = state?.status;
	const valid =
		typeof props.name === 'string' &&
		['once', 'repeatable'].includes(props.policy) &&
		props.labels &&
		['pending', 'submitted', 'retry'].every(
			(key) => typeof props.labels[key] === 'string'
		);
	const frozen =
		!valid ||
		lifecycle?.readOnly ||
		lifecycle?.requestPending ||
		status === 'pending' ||
		(props.policy === 'once' && status === 'submitted');
	const sameValues =
		props.policy === 'repeatable' &&
		state?.hasForm &&
		status === 'submitted' &&
		!state.dirty;
	const capture = () => {
		if (lifecycle)
			lifecycle.active.current = {
				name: props.name,
				policy: props.policy,
				hasForm: Boolean(ref.current?.querySelector('[role="form"]'))
			};
	};
	// Preserve input editing on repeatable forms, while retiring the unchanged submit buttons.
	React.useLayoutEffect(() => {
		ref.current
			?.querySelectorAll('.openui-buttons button')
			.forEach((button) => {
				if (sameValues) {
					button.dataset.docsbotDuplicateDisabled = 'true';
					button.disabled = true;
				} else if (button.dataset.docsbotDuplicateDisabled) {
					delete button.dataset.docsbotDuplicateDisabled;
					button.disabled = false;
				}
			});
	}, [sameValues, frozen]);
	if (nested) return null;
	const content = (
		<GroupNesting.Provider value={true}>
			{renderNode(props.children)}
		</GroupNesting.Provider>
	);
	const text = valid
		? status === 'pending'
			? props.labels.pending
			: status === 'submitted' && !state?.dirty
				? props.labels.submitted
				: status === 'retry'
					? props.labels.retry
					: null
		: null;
	return (
		<div
			ref={ref}
			data-docsbot-action-group={props.name}
			data-action-policy={props.policy}
			data-action-status={status || 'ready'}
			onClickCapture={capture}
			onKeyDownCapture={capture}
			style={{ minWidth: 0, width: '100%' }}
		>
			<FrozenInterface frozen={frozen}>{content}</FrozenInterface>
			{text && (
				<div
					role="status"
					style={{
						fontSize: 13,
						lineHeight: 1.5,
						marginTop: 8,
						color: 'var(--openui-text-neutral-secondary)'
					}}
				>
					{text}
				</div>
			)}
		</div>
	);
}

export const ActionGroup = defineComponent({
	name: 'ActionGroup',
	description:
		'DocsBot action lifecycle group. Wrap a whole form or alternative choices. Use once for confirmations/submissions, repeatable for exploration or editable filters. Unwrapped actions are repeatable. Give each group a unique name within the response; never nest groups. Supply concise pending/submitted/retry labels in the user language. Submitted means the intent was sent, not that a booking/payment succeeded.',
	props: z.object({
		name: z.string().min(1).max(64),
		policy: z.enum(['once', 'repeatable']),
		children: z.array(z.any()),
		labels: z.object({
			pending: z.string().min(1).max(160),
			submitted: z.string().min(1).max(160),
			retry: z.string().min(1).max(160)
		})
	}),
	component: Group
});
