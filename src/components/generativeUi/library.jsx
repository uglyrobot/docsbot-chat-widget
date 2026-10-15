import React from 'react'
import { createLibrary, defineComponent } from '@openuidev/react-lang'
import { z } from 'zod/v4'

const TextBlock = defineComponent({
  name: 'TextBlock',
  description: 'Readable text content. Use for headings, explanations, and labels.',
  props: z.object({ text: z.string(), heading: z.boolean().optional() }),
  component: ({ props }) => props.heading
    ? <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: 0 }}>{props.text}</h3>
    : <p style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5, color: "#374151", margin: 0 }}>{props.text}</p>,
})

const Callout = defineComponent({
  name: 'Callout',
  description: 'A short informational callout with plain text.',
  props: z.object({ title: z.string(), text: z.string() }),
  component: ({ props }) => (
    <aside aria-label={props.title} style={{ border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", padding: 12 }}>
      <strong style={{ display: "block", fontSize: 14, color: "#111827" }}>{props.title}</strong>
      <p style={{ margin: "4px 0 0", fontSize: 14, color: "#374151" }}>{props.text}</p>
    </aside>
  ),
})

const Metric = defineComponent({
  name: 'Metric',
  description: 'A single named metric with a value and optional context.',
  props: z.object({ label: z.string(), value: z.string(), context: z.string().optional() }),
  component: ({ props }) => (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#4b5563" }}>{props.label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#111827" }}>{props.value}</div>
      {props.context ? <div style={{ fontSize: 12, color: "#4b5563" }}>{props.context}</div> : null}
    </div>
  ),
})

const BulletList = defineComponent({
  name: 'BulletList',
  description: 'A short list of plain-text items.',
  props: z.object({ items: z.array(z.string()) }),
  component: ({ props }) => (
    <ul style={{ listStyle: "disc", paddingLeft: 20, margin: 0, fontSize: 14, color: "#374151" }}>
      {props.items.map((item, index) => <li key={index}>{item}</li>)}
    </ul>
  ),
})

const DataTable = defineComponent({
  name: 'DataTable',
  description: 'A compact data table. Each row must have one value per column.',
  props: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  component: ({ props }) => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ minWidth: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
        <thead><tr>{props.columns.map((column, index) => <th key={index} scope="col" style={{ borderBottom: "1px solid #d1d5db", padding: "8px 12px", fontWeight: 600 }}>{column}</th>)}</tr></thead>
        <tbody>{props.rows.map((row, rowIndex) => <tr key={rowIndex}>{props.columns.map((_, columnIndex) => <td key={columnIndex} style={{ borderBottom: "1px solid #e5e7eb", padding: "8px 12px" }}>{row[columnIndex] ?? ''}</td>)}</tr>)}</tbody>
      </table>
    </div>
  ),
})

const Content = z.union([
  TextBlock.ref,
  Callout.ref,
  Metric.ref,
  BulletList.ref,
  DataTable.ref,
])

const Stack = defineComponent({
  name: 'Stack',
  description: 'The required root container for a generated interface.',
  props: z.object({ children: z.array(Content) }),
  component: ({ props, renderNode }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{renderNode(props.children)}</div>
  ),
})

export const library = createLibrary({
  root: 'Stack',
  components: [Stack, TextBlock, Callout, Metric, BulletList, DataTable],
})
