export const DETAIL_CARD_MIN = 240
export const COMPACT_CARD_MIN = 160
export const CARD_GAP = 12

// A requested row is an upper bound, never permission to squeeze its cards.
export function cardColumns(width, maximum, minimum = DETAIL_CARD_MIN) {
  const max = Number.isFinite(maximum) ? Math.max(1, Math.floor(maximum)) : 1
  const available = Number.isFinite(width) ? Math.max(0, width) : 0
  return Math.min(max, Math.max(1, Math.floor((available + CARD_GAP) / (minimum + CARD_GAP))))
}

const detailTypes = new Set(['Card', 'SnippetCardBlock', 'OverviewCardBlock', 'ContextCardBlock', 'CompositeCardBlock', 'VisualCardBlock'])
function isCardNode(child, depth = 0) {
  if (child?.type !== 'element' || depth > 8) return false
  if (detailTypes.has(child.typeName)) return true
  return child.typeName === 'ActionGroup' && child.props?.children?.length > 0 && child.props.children.every(node => isCardNode(node, depth + 1))
}
export function isCardCollection(props) {
  const resolved = Array.isArray(props.children) ? props.children.filter(child => child != null) : []
  return props.direction === 'row' && resolved.length > 0 && resolved.every(child => isCardNode(child))
}

export function minimumCardWidth(children) {
  const compact = children.filter(child => child != null).every(child => {
    if (child.typeName === 'OverviewCardBlock') return true
    const contents = child.typeName === 'Card' && child.props?.children
    return Array.isArray(contents) && contents.some(node => /^MetricIndicator/.test(node?.typeName || '')) &&
      contents.every(node => ['CardHeader', 'MetricIndicatorInline', 'MetricIndicatorWithStrikethrough'].includes(node?.typeName))
  })
  return compact ? COMPACT_CARD_MIN : DETAIL_CARD_MIN
}
