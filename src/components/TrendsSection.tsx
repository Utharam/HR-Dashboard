import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import type { MonthlyTracker } from '../types';
import { formatCrores, formatINR } from '../utils/formatters';
import { describeTable, scrollRegionLabel } from '../utils/pagination';
import { useChartTokens } from '../theme/chartTokens';

const TABLE_TITLE = 'Historical monthly HR ledger';

interface TrendsSectionProps {
  tracker: MonthlyTracker[];
  /** See `OverviewSection`: offered only where the empty ledger is the filter's doing. */
  onClearFilters?: () => void;
}

export const TrendsSection: React.FC<TrendsSectionProps> = ({ tracker, onClearFilters }) => {
  const chartTokens = useChartTokens();

  // The ledger is the same window the caption describes. Derived once so the caption, the
  // row count a screen reader announces and the rendered rows cannot disagree.
  const ledgerRows = tracker.slice(-12).reverse();

  const latest = tracker[tracker.length - 1];
  const earliest = tracker[0];

  // Read the recorded headcount directly, matching the payroll read below.
  // `|| 200` published a fabricated 200-person workforce whenever the tracker
  // was empty or the last month recorded a genuine zero — so an empty tracker
  // claimed 200 staff beside a ₹0 payroll. No record means no headcount.
  const totalHeadcountCurrent = latest?.headcount ?? 0;
  // Read the recorded payroll directly. `|| 23000000` published a fabricated
  // ₹2.3 Cr monthly payroll whenever the tracker was empty or the last month
  // recorded a genuine zero — a payroll figure, not a placeholder, and the one
  // remaining `|| <numeric default>` on a payroll number in this section.
  const currentPayroll = latest?.grossPayroll ?? 0;

  // The two averages divide by the tracker length, which is 0 for an empty ledger.
  // `(0 / 0).toFixed(1)` is "NaN", which rendered on the page beside two honest zeros —
  // the one number there that was provably false, and the only one a reader would be sure
  // of. An empty ledger has no average to report, so it reports none.
  const avgAttendance = tracker.length
    ? (tracker.reduce((acc, t) => acc + t.avgAttendance, 0) / tracker.length).toFixed(1)
    : '0.0';
  const avgAttrition = tracker.length
    ? (tracker.reduce((acc, t) => acc + t.attritionPct, 0) / tracker.length).toFixed(2)
    : '0.00';

  // Growth between the first and last month ON RECORD.
  //
  // This was a literal `+14.3%`. It was the number a chart of the ledger underneath it did
  // not produce, so the tile and the chart beside it could contradict each other without
  // either being obviously broken. A first month of zero has no growth rate to report.
  const growthPct =
    earliest && earliest.headcount > 0 && totalHeadcountCurrent > 0
      ? ((totalHeadcountCurrent - earliest.headcount) / earliest.headcount) * 100
      : null;
  const growthLabel =
    growthPct === null
      ? 'Growth not derivable from this ledger'
      : `${growthPct >= 0 ? '+' : '−'}${Math.abs(growthPct).toFixed(1)}% over ${tracker.length} recorded months`;

  // Chart-facing objects, memoised. Every hook sits above the empty-ledger return
  // below so hook order cannot change between renders; computing these for an
  // empty tracker is safe (empty arrays, unused objects).
  const axisTickFont = useMemo(
    () => ({ family: chartTokens.font, size: 11 }),
    [chartTokens],
  );
  const labels = useMemo(() => tracker.map(t => t.month), [tracker]);
  const headcountData = useMemo(() => tracker.map(t => t.headcount), [tracker]);
  const payrollData = useMemo(() => tracker.map(t => Number((t.grossPayroll / 10000000).toFixed(2))), [tracker]); // In Cr as numbers

  const trendChartData = useMemo(() => ({
    labels,
    datasets: [
      {
        label: 'Gross Payroll Spend (₹ Crores)',
        data: payrollData,
        borderColor: chartTokens.primary,
        backgroundColor: chartTokens.primaryGlow,
        pointBackgroundColor: chartTokens.primary,
        pointBorderColor: chartTokens.surface,
        pointBorderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 12,
        borderWidth: 2,
        yAxisID: 'y1',
        fill: true,
        tension: 0.3
      },
      {
        label: 'Workforce Headcount',
        data: headcountData,
        borderColor: chartTokens.success,
        backgroundColor: chartTokens.success,
        pointBackgroundColor: chartTokens.success,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 12,
        borderWidth: 2,
        borderDash: [4, 4],
        yAxisID: 'y',
        tension: 0.2
      }
    ]
  }), [labels, payrollData, headcountData, chartTokens]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 420 },
    interaction: { mode: 'index' as const, intersect: false },
    scales: {
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        ticks: { color: chartTokens.success, font: axisTickFont, padding: 6 },
        grid: { color: chartTokens.grid, drawTicks: false },
        border: { display: false }
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        ticks: { color: chartTokens.primary, font: axisTickFont, padding: 6 },
        grid: { drawOnChartArea: false },
        border: { display: false }
      },
      x: {
        ticks: { color: chartTokens.tick, font: axisTickFont, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
        grid: { display: false },
        border: { display: false }
      }
    },
    plugins: {
      legend: {
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          color: chartTokens.tick,
          usePointStyle: true,
          pointStyle: 'line',
          boxWidth: 22,
          padding: 16,
          font: axisTickFont
        }
      },
      tooltip: {
        backgroundColor: chartTokens.well,
        titleColor: chartTokens.bright,
        bodyColor: chartTokens.tick,
        borderColor: chartTokens.border,
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        titleFont: { family: chartTokens.font, weight: 600 as const },
        bodyFont: { family: chartTokens.font }
      }
    }
  }), [chartTokens, axisTickFont]);

  // An empty ledger is an absence of history, not a workforce that shrank to nothing. The
  // table used to render a bare `<thead>` over an empty `<tbody>`, which reads as a broken
  // table rather than as an answer.
  if (tracker.length === 0) {
    return (
      <div className="section-stack">
        <div className="omni-card empty-state">
          <p className="empty-state__title">No monthly history has been recorded</p>
          <p className="empty-state__body">
            Headcount, payroll and attrition on this page are read from the historical
            ledger. It holds no months, so there is no trend to plot &mdash; this is not a
            workforce that has fallen to zero.
          </p>
          {onClearFilters && (
            <button type="button" onClick={onClearFilters} className="btn btn-secondary">
              Clear filters
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="section-stack">
      {/* 4 Trend Cards */}
      <div className="grid grid--kpi-lg">
        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Latest Recorded Headcount</span>
          <div className="kpi-value">{totalHeadcountCurrent}</div>
          {/* "Active Headcount" was the old label, and it put a figure from a month that
              has already closed next to live KPIs on the overview, as though both described
              now. The tracker is history; it says so. */}
          <span className="kpi-sub text-success">
            Historical: as at {latest?.month} &bull; {growthLabel}
          </span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Latest Recorded Monthly Payroll</span>
          <div className="kpi-value text-primary">{formatCrores(currentPayroll)}</div>
          <span className="kpi-sub">Historical: ₹{formatINR(currentPayroll)} for {latest?.month}</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Historical Attendance Avg</span>
          <div className="kpi-value text-info">{avgAttendance}%</div>
          {/* "Across 33 Consecutive Months" was a constant over a ledger that is appended to
              and can be shorter than that; it now counts what is actually on file. */}
          <span className="kpi-sub">Across {tracker.length} recorded months</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Avg Monthly Attrition</span>
          <div className="kpi-value text-warning">{avgAttrition}%</div>
          <span className="kpi-sub">Historical mean of {tracker.length} recorded months</span>
        </div>
      </div>

      {/* Main Historical Chart */}
      <div className="omni-card chart-card" style={{ height: '360px' }}>
        {/* The title used to read "33-Month ... (Jan 2024 – Sep 2026)" whatever the ledger
            held, which is the same unsourced claim the "Across 33 Consecutive Months"
            sub-label was. It now describes the rows the chart is actually plotting. */}
        <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-3)' }}>
          Headcount vs Total Payroll Spend ({earliest?.month} – {latest?.month}, {tracker.length} months)
        </h3>
        <div className="chart-body">
          <Line data={trendChartData} options={chartOptions} />
        </div>
      </div>

      {/* Historical Ledger Table */}
      <div className="omni-card omni-card--flush">
        <div className="omni-card-header">
          <div>
            <h3 className="omni-card-title">Historical Monthly HR Ledger (Last 12 Months)</h3>
            <p className="omni-card-sub">Chronological record of monthly hiring, exits, gross payroll, and attendance.</p>
          </div>
        </div>

        <div
          className="omni-table-wrap"
          role="region"
          aria-label={scrollRegionLabel(TABLE_TITLE)}
          tabIndex={0}
        >
          <table className="omni-table">
            <caption className="sr-only">
              {describeTable(TABLE_TITLE, ledgerRows.length, ledgerRows.length, 1, 1)}
            </caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Headcount</th>
                <th scope="col">Gross Payroll (INR)</th>
                <th scope="col">Monthly Hires</th>
                <th scope="col">Monthly Exits</th>
                <th scope="col">Attrition Rate</th>
                <th scope="col">Average Attendance</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map(t => (
                <tr key={t.month}>
                  <td className="cell-strong">{t.month}</td>
                  <td>{t.headcount} staff</td>
                  <td className="cell-strong text-success">₹{formatINR(t.grossPayroll)}</td>
                  <td className="cell-strong text-primary">+{t.hires} hires</td>
                  <td className="cell-strong text-danger-soft">−{t.exits} exits</td>
                  <td><span className="badge badge-active">{t.attritionPct}%</span></td>
                  <td>{t.avgAttendance}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
