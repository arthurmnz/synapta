import { useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDot, Table2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '../ui/Badge';
import { formatPercent, getPerformanceTierMeta } from '../../lib/formatters';
import type { TopicMetricOut } from '../../types/api';

interface TopicPerformanceChartProps {
  topics: TopicMetricOut[];
  sortOrder?: 'asc' | 'desc' | 'none';
  emptyMessage?: string;
}

interface ChartDatum extends TopicMetricOut {
  barColor: string;
  tierLabel: string;
}

export function TopicPerformanceChart({
  topics,
  sortOrder = 'asc',
  emptyMessage = 'Ainda não há respostas registradas por assunto para exibir o gráfico.',
}: TopicPerformanceChartProps) {
  const [showDataTable, setShowDataTable] = useState(false);

  if (!topics || topics.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#C4CCDC] bg-[#F8F8F5] px-4 py-10 text-center text-sm text-[#4B5568]">
        {emptyMessage}
      </div>
    );
  }

  const ordered = [...topics];
  if (sortOrder === 'asc') {
    ordered.sort((a, b) => a.accuracy_percentage - b.accuracy_percentage);
  } else if (sortOrder === 'desc') {
    ordered.sort((a, b) => b.accuracy_percentage - a.accuracy_percentage);
  }

  const data: ChartDatum[] = ordered.map((item) => {
    const meta = getPerformanceTierMeta(item.accuracy_percentage);
    return {
      ...item,
      barColor: meta.barColor,
      tierLabel: meta.label,
    };
  });

  const chartHeight = Math.max(250, data.length * 48 + 36);

  return (
    <figure className="space-y-4" aria-label="Gráfico de rendimento por assunto">
      {/* Legend with shape/icon redundancy + table fallback toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-[#4B5568]">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-[#BE123C]" aria-hidden="true" />
            <span>Crítico (&lt; 50%)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CircleDot className="h-3.5 w-3.5 text-[#D97706]" aria-hidden="true" />
            <span>Em evolução (50%–74%)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#059669]" aria-hidden="true" />
            <span>Bom rendimento (&ge; 75%)</span>
          </span>
        </div>

        <button
          type="button"
          aria-expanded={showDataTable}
          onClick={() => setShowDataTable((prev) => !prev)}
          className="inline-flex min-h-[44px] sm:min-h-[36px] items-center gap-1.5 rounded-lg border border-[#DCE1EB] bg-[#F8F8F5] px-3 py-1.5 text-xs font-semibold text-[#131B2E] hover:border-[#1B4FD8] hover:bg-[#EEF3FF] transition-colors cursor-pointer"
        >
          <Table2 className="h-3.5 w-3.5 text-[#4B5568]" aria-hidden="true" />
          <span>{showDataTable ? 'Ocultar tabela de dados' : 'Ver dados em tabela'}</span>
        </button>
      </div>

      <div className="w-full" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 56, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#DCE1EB" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(val: number) => `${val}%`}
              tick={{ fill: '#4B5568', fontSize: 12 }}
              axisLine={{ stroke: '#C4CCDC' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="topic_name"
              width={165}
              tick={{ fill: '#131B2E', fontSize: 12, fontWeight: 600 }}
              axisLine={{ stroke: '#C4CCDC' }}
              tickLine={false}
            />
            <ReferenceLine x={50} stroke="#C4CCDC" strokeDasharray="4 4" />
            <ReferenceLine x={75} stroke="#C4CCDC" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ fill: 'rgba(220, 225, 235, 0.35)' }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const item = payload[0].payload as ChartDatum;
                return (
                  <div className="rounded-lg border border-[#DCE1EB] bg-white px-3.5 py-2.5 shadow-elevated text-xs">
                    <p className="font-display font-bold text-[#131B2E]">{item.topic_name}</p>
                    <p className="mt-1 font-semibold tabular-nums" style={{ color: item.barColor }}>
                      Rendimento: {formatPercent(item.accuracy_percentage, 1)} ({item.tierLabel})
                    </p>
                    <p className="mt-0.5 font-mono text-[#4B5568] tabular-nums">
                      {item.correct_answers} acertos de {item.total_answers} respostas ({item.wrong_answers} erros)
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="accuracy_percentage" radius={[0, 4, 4, 0]} barSize={22}>
              {data.map((entry) => (
                <Cell key={String(entry.topic_id)} fill={entry.barColor} />
              ))}
              <LabelList
                dataKey="accuracy_percentage"
                position="right"
                formatter={(value: number) => `${Math.round(value)}%`}
                style={{ fill: '#131B2E', fontSize: 12, fontWeight: 700 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Accessible Data Table Fallback (non-color-dependent) */}
      {showDataTable && (
        <div className="overflow-x-auto rounded-lg border border-[#DCE1EB]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#DCE1EB] bg-[#F8F8F5] font-bold text-[#4B5568]">
                <th className="px-4 py-2.5">Assunto</th>
                <th className="px-4 py-2.5">Faixa</th>
                <th className="px-4 py-2.5 text-right">Acertos / Total</th>
                <th className="px-4 py-2.5 text-right">Rendimento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE1EB] bg-white">
              {data.map((row) => {
                const meta = getPerformanceTierMeta(row.accuracy_percentage);
                return (
                  <tr key={String(row.topic_id)}>
                    <td className="px-4 py-2.5 font-semibold text-[#131B2E]">{row.topic_name}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={meta.badgeTone}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#4B5568]">
                      {row.correct_answers}/{row.total_answers}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-[#131B2E]">
                      {formatPercent(row.accuracy_percentage, 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
