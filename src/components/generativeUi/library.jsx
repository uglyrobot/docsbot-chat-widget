import { openuiLibrary } from '@openuidev/react-ui'
import { ActionGroup } from './ActionLifecycle'
import { responsiveCardOverrides } from './ResponsiveCards'
// Preserve the official contract; constrain card layouts at render time.
export const library = openuiLibrary.extend({components:{override:responsiveCardOverrides(openuiLibrary),add:[{component:ActionGroup,slots:['Card.children']}]}})
