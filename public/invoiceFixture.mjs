export function invoiceProgram(maximum = 8, { nested = false, count = 8 } = {}) {
  const max = [1,2,8].includes(Number(maximum)) ? Number(maximum) : 8
  const months = ['January 2026','December 2025','November 2025','October 2025','September 2025','August 2025','July 2025','June 2025']
  const rows = []
  const declarations = []
  for(let i=0;i<count;i++) declarations.push(`invoice${i} = Card([CardHeader("INV-DEMO-2026-CUSTOMER-LONG-${String(i+1).padStart(3,'0')}", "${months[i]}"),TagBlock(["${i%2?'Paid':'Open'}"]),MetricIndicatorInline("$124.00", "Standard plan"),ActionGroup("invoice-${i}", "once", [Buttons([Button("View invoice ${i+1}")])], {pending:"Sending…",submitted:"Demo choice sent",retry:"Retry demo choice"})])`)
  for(let i=0;i<count;i+=max) rows.push(`Stack([${Array.from({length:Math.min(max,count-i)},(_,n)=>`invoice${i+n}`).join(',')}],"row","m","stretch","start",true)`)
  return `root = Stack([${nested ? `Card([${rows.join(',')}])` : rows.join(',')}])\n${declarations.join('\n')}`
}
export function measureInvoiceLayout(root = document) {
 const surfaces = root.querySelectorAll('.docsbot-openui-surface')
 const surface = surfaces[surfaces.length - 1] || root
 const cards = [...surface.querySelectorAll('[data-docsbot-action-group]')].map(x=>x.closest('.openui-card')).filter(Boolean)
 const unique = [...new Set(cards)]
 const rows = new Map()
 for(const card of unique) { const top=Math.round(card.getBoundingClientRect().top); rows.set(top,(rows.get(top)||0)+1) }
 const widths=unique.map(x=>Math.round(x.getBoundingClientRect().width))
 return `UI width ${Math.round(surface.getBoundingClientRect?.().width || 0)}px; items ${unique.length}; columns ${Math.max(0,...rows.values())}; rows ${rows.size}; card widths ${[...new Set(widths)].join('/') }px; page overflow ${Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)}px; UI overflow ${Math.max(0,(surface.scrollWidth||0)-(surface.clientWidth||0))}px`
}
