import { createLibrary } from '@openuidev/react-lang'
import { openuiLibrary } from '@openuidev/react-ui'
import { ActionGroup } from './ActionLifecycle'
import { responsiveCardOverrides } from './ResponsiveCards'
// Remove generated dialogs before serializing or rendering the library.
const inlineLibrary = openuiLibrary.extend({components:{remove:['Modal'],override:responsiveCardOverrides(openuiLibrary),add:[{component:ActionGroup,slots:['Card.children']}]}})
// Upstream removal prunes schemas, but retains obsolete group examples.
export const library = createLibrary({
  components: Object.values(inlineLibrary.components),
  componentGroups: inlineLibrary.componentGroups?.map(group => ({
    ...group, notes: group.notes?.filter(note => !/\bModal\b/.test(note)),
  })),
  functions: Object.values(inlineLibrary.functions || {}),
  actions: Object.values(inlineLibrary.actions || {}),
  root: inlineLibrary.root,
  id: inlineLibrary.id,
})
