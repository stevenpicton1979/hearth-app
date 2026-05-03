'use client'

import { useState } from 'react'

interface BucketRow {
  bucket: string[]
  label: string
  totalAmount: number
  count: number
}

const aud = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })

interface LeafNode {
  kind: 'leaf'
  bucket: string[]
  label: string
  totalAmount: number
  count: number
}

interface GroupNode {
  kind: 'group'
  key: string
  totalAmount: number
  count: number
  children: TreeNode[]
}

type TreeNode = GroupNode | LeafNode

function buildTree(buckets: BucketRow[]): GroupNode[] {
  const root = new Map<string, GroupNode>()

  for (const row of buckets) {
    const [l0, ...rest] = row.bucket
    if (!l0) continue

    if (!root.has(l0)) {
      root.set(l0, { kind: 'group', key: l0, totalAmount: 0, count: 0, children: [] })
    }
    const top = root.get(l0)!
    top.totalAmount += row.totalAmount
    top.count += row.count

    if (rest.length <= 1) {
      top.children.push({ kind: 'leaf', ...row })
      continue
    }

    const [l1, ...rest2] = rest
    let mid = top.children.find((c): c is GroupNode => c.kind === 'group' && c.key === l1) ?? null
    if (!mid) {
      mid = { kind: 'group', key: l1, totalAmount: 0, count: 0, children: [] }
      top.children.push(mid)
    }
    mid.totalAmount += row.totalAmount
    mid.count += row.count

    if (rest2.length <= 1) {
      mid.children.push({ kind: 'leaf', ...row })
      continue
    }

    const [l2] = rest2
    let sub = mid.children.find((c): c is GroupNode => c.kind === 'group' && c.key === l2) ?? null
    if (!sub) {
      sub = { kind: 'group', key: l2, totalAmount: 0, count: 0, children: [] }
      mid.children.push(sub)
    }
    sub.totalAmount += row.totalAmount
    sub.count += row.count
    sub.children.push({ kind: 'leaf', ...row })
  }

  return Array.from(root.values()).sort((a, b) => b.totalAmount - a.totalAmount)
}

function GroupRow({ node, depth, open, onToggle }: {
  node: GroupNode
  depth: number
  open: boolean
  onToggle: () => void
}) {
  const indent = depth * 20
  return (
    <tr
      className="cursor-pointer hover:bg-gray-50 border-t border-gray-100"
      onClick={onToggle}
    >
      <td className="px-4 py-2 font-semibold text-gray-800 text-sm" style={{ paddingLeft: indent + 16 }}>
        <span className="mr-1 text-gray-400">{open ? '▾' : '▸'}</span>
        {node.key}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-gray-500 text-xs">{node.count.toLocaleString()} txns</td>
      <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-800 text-sm">{aud(node.totalAmount)}</td>
    </tr>
  )
}

function LeafRow({ node, depth }: { node: LeafNode; depth: number }) {
  const indent = depth * 20
  return (
    <tr className="border-t border-gray-50 hover:bg-blue-50">
      <td className="px-4 py-2 text-gray-700 text-sm" style={{ paddingLeft: indent + 16 }}>
        {node.bucket[node.bucket.length - 1]}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-gray-400 text-xs">{node.count.toLocaleString()}</td>
      <td className="px-4 py-2 text-right tabular-nums text-gray-700 text-sm">{aud(node.totalAmount)}</td>
    </tr>
  )
}

function SubTree({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(key)) { next.delete(key) } else { next.add(key) }
    return next
  })
  return (
    <>
      {nodes.map((node, i) => {
        if (node.kind === 'leaf') return <LeafRow key={`${node.label}-${i}`} node={node} depth={depth} />
        const isOpen = open.has(node.key)
        return (
          <>
            <GroupRow key={node.key} node={node} depth={depth} open={isOpen} onToggle={() => toggle(node.key)} />
            {isOpen && <SubTree key={`${node.key}-children`} nodes={node.children} depth={depth + 1} />}
          </>
        )
      })}
    </>
  )
}

export function SpendingBuckets({ buckets }: { buckets: BucketRow[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const tree = buildTree(buckets)
  const grandTotal = tree.reduce((s, n) => s + n.totalAmount, 0)
  const grandCount = tree.reduce((s, n) => s + n.count, 0)

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(key)) { next.delete(key) } else { next.add(key) }
    return next
  })

  if (tree.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 mt-6">
        <h2 className="font-semibold text-gray-900 mb-2">Spending by Outcome Bucket</h2>
        <p className="text-sm text-gray-400">No transactions in this period.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mt-6">
      <h2 className="font-semibold text-gray-900 mb-3">Spending by Outcome Bucket</h2>
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bucket</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Txns</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {tree.map(node => {
              const isOpen = open.has(node.key)
              return (
                <>
                  <GroupRow key={node.key} node={node} depth={0} open={isOpen} onToggle={() => toggle(node.key)} />
                  {isOpen && <SubTree key={`${node.key}-children`} nodes={node.children} depth={1} />}
                </>
              )
            })}
            <tr className="border-t-2 border-gray-300 bg-gray-50">
              <td className="px-4 py-2 font-bold text-gray-900">Total</td>
              <td className="px-4 py-2 text-right tabular-nums text-gray-500 text-xs">{grandCount.toLocaleString()}</td>
              <td className="px-4 py-2 text-right tabular-nums font-bold text-gray-900">{aud(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
