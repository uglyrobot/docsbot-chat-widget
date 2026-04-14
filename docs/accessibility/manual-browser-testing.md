# Manual Browser Testing

Scope note: Browser testing was limited to the local widget demo and embedded mode. This was an engineer-led validation using local Chromium plus direct DOM/state observation; it was not a full multi-browser human exploratory pass.

## Environment

- Local environment date: 2026-04-14
- Browser/runtime: Chromium via Playwright on macOS
- Build served locally from `build/`
- Widget config and agent responses mocked for determinism

## Flows tested

### 1. Floating launcher open and close

Steps:
1. Load the demo page.
2. Tab forward from the demo controls until the widget launcher receives focus.
3. Press `Enter` to open the widget.
4. Confirm focus lands in the chat textarea.
5. Press `Escape` to close the widget.

Observed:
- Launcher is keyboard reachable.
- Launcher receives visible focus.
- Focus lands in the chat input on open.
- Focus returns to the launcher on close.

Status: Pass

### 2. Send a message and inspect response controls

Steps:
1. Open the floating widget.
2. Enter a test question.
3. Submit via keyboard.
4. Inspect the rendered bot response, source link, upload button, and copy-response button.

Observed:
- Keyboard submission works.
- Source link is exposed as a link with a readable name.
- Copy-response button and upload button expose accessible names.
- Transcript remains in DOM order.

Status: Pass in mocked flow

### 3. Lead-capture escalation flow

Steps:
1. Open the floating widget.
2. Send a support-oriented message.
3. Activate the support/escalation button.
4. Inspect required fields and validation state.
5. Change one required field and confirm missing required fields are flagged.

Observed:
- Required fields are labeled.
- Missing required fields expose `aria-invalid`.
- Error text is associated to affected fields.
- Continue button remains disabled until required values are supplied.

Status: Pass

### 4. Embedded chat mode

Steps:
1. Load the demo page with `?embedded=1`.
2. Confirm the embedded chat surface renders without the floating launcher.
3. Inspect the chat input label and visible structure.

Observed:
- Embedded mode renders correctly.
- Input label wiring remains present.
- No critical axe violations were found in the embedded state.

Status: Pass in evaluated flow

## Limitations

- No Safari, Firefox, iOS, or Android manual pass was performed.
- No human-operated 200% zoom sweep was completed beyond code review and harness changes.
- Real backend data variability was not used; mocked responses were chosen to exercise predictable states.
