'use client'

import { useState, useEffect, useCallback } from 'react'

interface BucketRow {
  bucket: string[]
  label: string
  totalAmount: number
  count: number
}

interface BucketsResult {
  buckets: BucketRow[]
  periodMonths: number
}

const PERIOD_OPTIONS = [3, 6, 12] as const
type Period = typeof PERIOD_OPTIONS[number]

function fmt(amount: number) {
  return amount.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

// ── Tree node types ──────────────────────────────────────────────────────────

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

// ── Sub-tree renderer ────────────────────────────────────────────────────────

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
      <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-800 text-sm">{fmt(node.totalAmount)}</td>
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
      <td className="px-4 py-2 text-right tabular-nums text-gray-700 text-sm">{fmt(node.totalAmount)}</td>
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
        if (node.kind === 'leaf') return <LeafRow key={i} node={node} depth={depth} />
        const isOpen = open.has(node.key)
        return (
          <>
            <GroupRow key={node.key} node={node} depth={depth} open={isOpen} onToggle={() => toggle(node.key)} />
            {isOpen && <SubTree nodes={node.children} depth={depth + 1} />}
          </>
        )
      })}
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BucketsPage() {
  const [period, setPeriod] = useState<Period>(12)
  const [result, setResult] = useState<BucketsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())

  const load = useCallback(async (months: Period) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dev/buckets?months=${months}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setResult(await res.json())
      setOpen(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [load, period])

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(key)) { next.delete(key) } else { next.add(key) }
    return next
  })

  const tree = result ? buildTree(result.buckets) : []
  const grandTotal = tree.reduce((s, n) => s + n.totalAmount, 0)

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Spending Buckets</h1>
          <p className="mt-1 text-sm text-gray-500">Transaction totals grouped by outcome bucket.</p>
        </div>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map(m => (
            <button
              key={m}
              onClick={() => setPeriod(m)}
              className={`px-3 py-1.5 text-sm rounded font-medium ${period === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {m}m
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {!loading && result && (
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
                    {isOpen && <SubTree nodes={node.children} depth={1} />}
                  </>
                )
              })}
              <tr className="border-t-2 border-gray-300 bg-gray-50">
                <td className="px-4 py-2 font-bold text-gray-900">Total</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-500 text-xs">
                  {tree.reduce((s, n) => s + n.count, 0).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-bold text-gray-900">{fmt(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
