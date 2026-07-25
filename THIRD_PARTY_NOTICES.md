# Third-Party Notices

This project includes third-party software and model artifacts. The notices below
apply to redistributed assets in this repository and in the widget CDN build.

## Rampart

- Name: Rampart
- Author: National Design Studio
- Source: https://github.com/nationaldesignstudio/rampart
- Model: https://huggingface.co/nationaldesignstudio/rampart
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- License text: https://creativecommons.org/licenses/by/4.0/legalcode

DocsBot redistributes Rampart runtime and model artifacts for optional
client-side PII redaction in the embeddable chat widget. The model artifacts are
self-hosted from the DocsBot widget CDN instead of being fetched from Hugging
Face at runtime.

Changes made by DocsBot:

- The Rampart runtime is hosted as a widget CDN asset.
- The hosted runtime copy exposes a small `configureTransformersEnv` helper so
  the widget can force Transformers.js to load the self-hosted model files and
  avoid remote Hugging Face requests.

No endorsement by National Design Studio is implied.

Rampart reports that its training data includes OpenPII 1.5M, also licensed
under CC BY 4.0. See the Rampart model card and repository for upstream model
scope, evaluation details, and limitations.

## thinking-orbs

- Name: thinking-orbs 0.1.1
- Author: Jakub Antalik
- Source: https://github.com/Jakubantalik/thinking-orbs
- License: MIT

DocsBot uses the package's public Canvas 2D frame painters in the voice-call
view. The integration adapts the presentation for a larger responsive canvas,
DocsBot voice states, and the widget's brand color while retaining upstream
reduced-motion and visibility-aware animation behavior.

Copyright (c) 2026 Jakub Antalik. Permission is hereby granted, free of charge,
to any person obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, subject to inclusion of this
copyright and permission notice. The Software is provided "AS IS", without
warranty of any kind.

## UI SFX

- Name: UI SFX (zen / recording, zen / processing)
- Author: Romain Simon / UI SFX
- Source: https://github.com/romainsimon/uisfx
- Assets: `sounds/zen/recording.mp3`, `sounds/zen/processing.mp3`
- License: Creative Commons Zero v1.0 Universal (CC0 1.0)
- License text: https://creativecommons.org/publicdomain/zero/1.0/

DocsBot vendors two CC0 loops from the UI SFX zen pack as quiet beds during
voice tool calls, inlined as data URIs in `voiceToolWorkingSrc.mjs` (zen /
recording) and `voiceToolSearchingSrc.mjs` (zen / processing). No endorsement
by the UI SFX authors is implied.
