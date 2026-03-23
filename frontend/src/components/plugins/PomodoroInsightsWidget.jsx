import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { useTheme } from '../../contexts/ThemeContext'
import { BarChart3, Clock, Target, TrendingUp } from 'lucide-react'

export default function PomodoroInsightsWidget() {
  const { dark } = useTheme()
  const [data, setData] = useState(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    api.get(`/plugins/pomodoro_insights/insights?days=${days}`)
      .then(setData)
      .catch(() => {})
  }, [days])

  if (!data) return null
  if (data.total_sessions === 0) {
    return (
      <div className="rounded-xl p-4" style={{ background: dark ? '#111111' : '#f5f3ee', border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}` }}>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={14} className="text-[#c4a759]" />
          <span className="text-xs font-medium text-text">study insights</span>
        </div>
        <p className="text-xs text-text-muted">no study sessions yet. start a pomodoro to see insights here.</p>
      </div>
    )
  }

  const maxHourly = Math.max(...data.hourly_distribution, 1)

  function formatHour(h) {
    if (h === 0) return '12a'
    if (h < 12) return `${h}a`
    if (h === 12) return '12p'
    return `${h - 12}p`
  }

  return (
    <div className="rounded-xl p-4" style={{ background: dark ? '#111111' : '#f5f3ee', border: `1px solid ${dark ? '#1c1c1c' : '#ddd9d0'}` }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-[#c4a759]" />
          <span className="text-xs font-medium text-text">study insights</span>
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className={`text-[10px] px-2 py-1 rounded-md border ${dark ? 'bg-[#0a0a0a] border-[#1c1c1c] text-text-secondary' : 'bg-white border-[#ddd] text-[#666]'}`}
        >
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className={`rounded-lg p-2.5 ${dark ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Target size={10} className="text-text-muted" />
            <span className="text-[10px] text-text-muted">completion</span>
          </div>
          <span className="text-sm font-medium text-text">{data.completion_rate}%</span>
        </div>
        <div className={`rounded-lg p-2.5 ${dark ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={10} className="text-text-muted" />
            <span className="text-[10px] text-text-muted">avg session</span>
          </div>
          <span className="text-sm font-medium text-text">{data.avg_session_minutes}m</span>
        </div>
        <div className={`rounded-lg p-2.5 ${dark ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={10} className="text-text-muted" />
            <span className="text-[10px] text-text-muted">total</span>
          </div>
          <span className="text-sm font-medium text-text">{data.total_sessions} sessions</span>
        </div>
        <div className={`rounded-lg p-2.5 ${dark ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 size={10} className="text-text-muted" />
            <span className="text-[10px] text-text-muted">peak</span>
          </div>
          <span className="text-sm font-medium text-text">{data.peak_hour != null ? formatHour(data.peak_hour) : '-'} / {data.peak_day || '-'}</span>
        </div>
      </div>

      {/* Hourly distribution */}
      <div className="mb-3">
        <span className="text-[10px] text-text-muted block mb-2">hourly activity</span>
        <div className="flex items-end gap-px h-10">
          {data.hourly_distribution.map((count, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm transition-all"
              style={{
                height: `${(count / maxHourly) * 100}%`,
                minHeight: count > 0 ? '2px' : '0px',
                backgroundColor: count > 0 ? '#c4a759' : (dark ? '#1a1a1a' : '#e5e5e5'),
                opacity: count > 0 ? 0.4 + (count / maxHourly) * 0.6 : 0.3,
              }}
              title={`${formatHour(i)}: ${count} sessions`}
            />
          ))}
        </div>
      </div>

      {/* Top subjects */}
      {data.top_subjects.length > 0 && (
        <div>
          <span className="text-[10px] text-text-muted block mb-1.5">top subjects</span>
          <div className="space-y-1">
            {data.top_subjects.slice(0, 3).map(s => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-[11px] text-text-secondary truncate">{s.label}</span>
                <span className="text-[10px] text-text-muted ml-2">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
