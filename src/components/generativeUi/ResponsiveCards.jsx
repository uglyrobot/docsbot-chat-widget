import React, { useLayoutEffect, useRef, useState } from 'react'
import { cardColumns, isCardCollection, minimumCardWidth, CARD_GAP } from './cardLayout.mjs'

function useColumns(maximum, minimum) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    // Content-box width excludes the card's own padding/border for nested rows.
    const measure = () => {
      const css = getComputedStyle(element)
      setWidth(Math.max(0, element.clientWidth - parseFloat(css.paddingLeft || 0) - parseFloat(css.paddingRight || 0)))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(entries => {
      if (entries[0]) setWidth(entries[0].contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, cardColumns(width, maximum, minimum)]
}

function CardRow({ definition, props, renderNode }) {
  const [ref, columns] = useColumns(props.children.length, minimumCardWidth(props.children))
  // These two pinned upstream renderers are hook-free and return a div / a
  // ref-forwarding Card. Keep their semantic markup and all existing props.
  const element = definition.component({ props, renderNode })
  return React.cloneElement(element, {
    ref,
    'data-docsbot-card-grid': '',
    'data-max-columns': props.children.length,
    'data-columns': columns,
    style: { ...element.props.style, display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: CARD_GAP, width: '100%', minWidth: 0, alignItems: 'stretch' },
  })
}

function CardBlock({ definition, props, renderNode, maximum, minimum }) {
  const [ref, columns] = useColumns(Math.min(maximum, props.items?.length || 1), minimum)
  const Original = definition.component
  return <div ref={ref} data-docsbot-card-block="" data-columns={columns} style={{ minWidth: 0, width: '100%', '--docsbot-card-columns': columns }}><Original props={props} renderNode={renderNode} /></div>
}

export function responsiveCardOverrides(library) {
  return [
    ...['Stack', 'Card'].map(name => {
      const definition = library.components[name]
      return { ...definition, component: function ResponsiveRow(args) {
        return isCardCollection(args.props) ? <CardRow {...args} definition={definition} /> : <definition.component {...args} />
      } }
    }),
    ...[['OverviewCardBlock', 3, 160], ['SnippetCardBlock', 2, 240], ['ContextCardBlock', 3, 240], ['CompositeCardBlock', 2, 240], ['VisualCardBlock', 3, 240]].map(([name, maximum, minimum]) => {
      const definition = library.components[name]
      return { ...definition, component: function ResponsiveBlock(args) {
        return args.props.layout === 'carousel' ? <definition.component {...args} /> : <CardBlock {...args} definition={definition} maximum={maximum} minimum={minimum} />
      } }
    }),
  ]
}
