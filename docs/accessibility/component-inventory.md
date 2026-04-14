# DocsBot Chat Widget Component Inventory

Scope note: Only components and patterns present in this repository are listed as in-scope. Requested patterns that are not implemented here are marked `Not present in evaluated scope`.

## Interactive patterns present

| Pattern | Component / file | Where used | Likely accessibility risks |
| --- | --- | --- | --- |
| Floating launcher button | `FloatingButton.jsx` | Public floating widget | Accessible name, toggle state, keyboard activation, focus return |
| Close button | `Chatbot.jsx` | Floating mobile close control | Semantic button usage, focus recovery |
| Reset conversation button | `Chatbot.jsx` | Header actions | Icon-only naming, focus styling |
| Suggested question buttons | `Chatbot.jsx` | Initial widget state | Keyboard activation, visible labels |
| Chat input textarea | `Chatbot.jsx` | Floating and embedded widget | Programmatic label, Enter/Shift+Enter behavior, disabled state |
| Send button | `Chatbot.jsx` | Chat input form | Icon-only naming, disabled semantics |
| Upload image button and hidden file input | `Chatbot.jsx` | Agent image upload flow | Naming, focusability, drag/drop parity |
| Remove image buttons | `Chatbot.jsx` | Selected image previews | Icon-only naming, small target size |
| Scroll-to-latest button | `Chatbot.jsx` | Conversation overflow state | Keyboard access, visible focus |
| Bot message content | `BotChatMessage.jsx` | Transcript | Status messaging, error announcements, semantic grouping |
| User message content | `UserChatMessage.jsx` | Transcript | Non-text alternative text for uploaded images |
| Copy response button | `BotChatMessage.jsx` | Bot messages when enabled | Icon-only naming, status text |
| Source links | `Source.jsx` | Bot responses with sources | Link purpose depends on source title/URL quality |
| Feedback buttons | `BotChatMessage.jsx` | Legacy and agent feedback flows | Accessible name vs visible emoji-only content |
| Support / escalation buttons | `BotChatMessage.jsx` | Escalation flows | Accessible name, keyboard activation |
| Lead-capture form fields | `LeadCollectMessage.jsx` | Escalation / pre-response flows | Labels, required state, error association, disabled prefill handling |
| Select menus inside lead capture | `LeadCollectMessage.jsx` | Schema-driven fields | Labeling, invalid state |
| Color input | `LeadCollectMessage.jsx` | Schema-driven fields | Labeling, announced value |
| Inline scheduler embeds | `CalendlyEmbed.jsx`, `CalComEmbed.jsx`, `TidyCalEmbed.jsx` | Agent tool-call flows | Embedded third-party keyboard and screen reader behavior |
| Stripe billing actions | `StripeBilling.jsx` | Billing-related agent responses | Icon button names, table/list semantics, status badge contrast |
| Link lists | `LinkList.jsx` | Legacy or link responses | Link text quality |

## Patterns reviewed as not present in this repo

| Pattern | Status |
| --- | --- |
| Authentication forms / sign-in / sign-up | Not present in evaluated scope |
| Dashboard navigation | Not present in evaluated scope |
| Admin settings screens | Not present in evaluated scope |
| Knowledge base management UI | Not present in evaluated scope |
| Tabs | Not present in evaluated scope |
| Accordions | Not present in evaluated scope |
| Data tables / grids outside Stripe billing cards | Not present in evaluated scope |
| Menus | Not present in evaluated scope |
| Dropdown menus separate from native `<select>` | Not present in evaluated scope |
| Tooltips / popovers | Not present in evaluated scope |
| Toasts | Not present in evaluated scope |
| Drawers | Not present in evaluated scope |
| Drag-and-drop controls beyond image drop handling in the input area | Not present as a standalone component |
| Pagination | Not present in evaluated scope |
| Search/filter interfaces | Not present in evaluated scope |
