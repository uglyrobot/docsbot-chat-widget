export function scrollToBottom(ref) {
	if (ref?.current) {
		ref.current.scrollTop = ref.current.scrollHeight;
	}
}