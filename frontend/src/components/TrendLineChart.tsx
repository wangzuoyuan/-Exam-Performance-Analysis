'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceArea } from 'recharts'

interface ReferenceAreaSpec {
  x1: string
  x2: string
  fill: string
  label?: string
}

interface TrendLineChartProps {
  data: { exam_name: string; rank?: number; score?: number; [key: string]: unknown }[]
  yDataKey: string
  color?: string
  yDomain?: [number, number]
  invertY?: boolean
  /** 参考区域（学段背景带）。x1/x2 取 exam_name 值。 */
  referenceAreas?: ReferenceAreaSpec[]
  /** 当某个 data 点的该字段 === true 时，该点渲染为淡化空心点（导入数据）。 */
  importedKey?: string
}

export default function TrendLineChart({
  data,
  yDataKey,
  color = '#2563eb',
  yDomain,
  invertY = false,
  referenceAreas,
  importedKey,
}: TrendLineChartProps) {
  // 自定义 dot 渲染：导入点淡化空心，其余点保持原实心样式。
  const dotRender = importedKey
    ? (props: {
        cx?: number
        cy?: number
        payload?: Record<string, unknown>
      }) => {
        const { cx, cy, payload } = props
        if (cx == null || cy == null) return <g key="empty" />
        const imported = !!(payload && payload[importedKey] === true)
        if (imported) {
          return (
            <circle
              key={`${cx}-${cy}-imported`}
              cx={cx}
              cy={cy}
              r={3}
              fill={color}
              fillOpacity={0.3}
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.5}
            />
          )
        }
        return (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={4}
            fill={color}
            strokeWidth={0}
          />
        )
      }
    : { r: 4, fill: color, strokeWidth: 0 }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
        {referenceAreas?.map((area, i) => (
          <ReferenceArea
            key={`ref-${i}`}
            x1={area.x1}
            x2={area.x2}
            fill={area.fill}
            fillOpacity={0.4}
            strokeOpacity={0}
          />
        ))}
        <XAxis
          dataKey="exam_name"
          tick={{ fontSize: 12, fill: '#64748b' }}
          stroke="#e2e8f0"
        />
        <YAxis
          domain={yDomain || [0, 'auto']}
          reversed={invertY}
          tick={{ fontSize: 12, fill: '#64748b' }}
          stroke="#e2e8f0"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
            fontSize: 12,
          }}
          labelStyle={{ color: '#0f172a', fontWeight: 500 }}
          itemStyle={{ color: '#334155' }}
        />
        <Line
          type="monotone"
          dataKey={yDataKey}
          stroke={color}
          strokeWidth={2}
          dot={dotRender}
          activeDot={{ r: 6, fill: color, strokeWidth: 2, stroke: '#ffffff' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
