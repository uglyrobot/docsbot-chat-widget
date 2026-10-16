import { openuiLibrary } from '@openuidev/react-ui'
import { ActionGroup } from './ActionLifecycle'
// Keep the official set; add only the DocsBot lifecycle wrapper.
export const library = openuiLibrary.extend({components:{add:[{component:ActionGroup,slots:['Card.children']}]}})
