import React from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import 'chart.js/auto';
import { Users, CreditCard, Award, CalendarCheck, TrendingDown, Sparkles } from 'lucide-react';
import type { Employee, Department } from '../types';
import { formatINR, formatCrores, formatLakhs } from '../utils/formatters';
import { computeAttendancePct } from '../utils/dates';

interface OverviewSectionProps {
  employees: Employee[];
  departments: Department[];
  onSelectEmployee: (emp: Employee) => void;
}

// Canvas cannot resolve CSS custom properties, so the chart palette is read
// from the token layer once. Change a token in index.css and the charts follow.
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const CHART = {
  primary: token('--primary'),
  success: token('--success'),
  warning: token('--warning'),
  danger: token('--danger'),
  info: token('--info'),
  purple: token('--purple'),
  pink: token('--pink'),
  neutral: token('--neutral-tone'),
  surface: token('--bg-card'),
  tick: token('--text-muted'),
  dim: token('--text-dim'),
  grid: token('--grid-line'),
  font: token('--font-sans')
};

const tooltipTheme = {
  backgroundColor: token('--bg-well'),
  titleColor: token('--text-bright'),
  bodyColor: token('--text-muted'),
  borderColor: token('--border'),
  borderWidth: 1,
  cornerRadius: 8,
  padding: 10,
  displayColors: true,
  titleFont: { family: CHART.font, weight: 600 as const },
  bodyFont: { family: CHART.font }
};

const axisTickFont = { family: CHART.font, size: 11 };

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  employees,
  departments,
  onSelectEmployee
}) => {
  // Aggregate Metrics
  const totalHeadcount = employees.length;
  const activeCount = employees.filter(e => e.status === 'Active').length;
  const probationCount = employees.filter(e => e.status === 'Probation').length;
  const noticeCount = employees.filter(e => e.status === 'Notice Period').length;

  const totalMonthlyPayroll = employees.reduce((acc, e) => acc + e.monthlyCTC, 0);
  const avgMonthlyCTC = totalHeadcount ? totalMonthlyPayroll / totalHeadcount : 0;
  const avgAttendance = totalHeadcount 
    ? (employees.reduce((acc, e) => acc + computeAttendancePct(e.presentDays), 0) / totalHeadcount).toFixed(1)
    : '95.2';

  // Diversity
  const femaleCount = employees.filter(e => e.gender === 'Female').length;
  const maleCount = employees.filter(e => e.gender === 'Male').length;
  const nbCount = employees.filter(e => e.gender === 'Non-Binary').length;
  const femaleRatio = totalHeadcount ? ((femaleCount / totalHeadcount) * 100).toFixed(1) : '48.0';

  // High Performers (5-star rating)
  const topPerformers = employees.filter(e => e.performanceRating === 5).slice(0, 5);

  // 1. Department Headcount Chart Data
  const deptLabels = departments.map(d => d.name.split(' ')[0]);
  const deptHeadcounts = departments.map(d => employees.filter(e => e.department === d.name).length);
  const deptPayrolls = departments.map(d => 
    employees.filter(e => e.department === d.name).reduce((sum, e) => sum + e.monthlyCTC, 0) / 100000 // In Lakhs
  );

  const headcountChartData = {
    labels: deptLabels,
    datasets: [
      {
        label: 'Staff Headcount',
        data: deptHeadcounts,
        backgroundColor: CHART.primary,
        borderRadius: 6,
        maxBarThickness: 48
      }
    ]
  };

  const payrollChartData = {
    labels: deptLabels,
    datasets: [
      {
        label: 'Monthly Payroll (₹ Lakhs)',
        data: deptPayrolls,
        backgroundColor: CHART.success,
        borderRadius: 6,
        maxBarThickness: 48
      }
    ]
  };

  // 2. Diversity & Status Doughnut
  const statusDoughnutData = {
    labels: ['Active', 'Probation', 'Notice Period', 'Resigned'],
    datasets: [
      {
        data: [
          activeCount,
          probationCount,
          noticeCount,
          employees.filter(e => e.status === 'Resigned').length
        ],
        backgroundColor: [CHART.success, CHART.warning, CHART.danger, CHART.neutral],
        borderColor: CHART.surface,
        borderWidth: 2,
        hoverOffset: 4
      }
    ]
  };

  const diversityDoughnutData = {
    labels: ['Female', 'Male', 'Non-Binary'],
    datasets: [
      {
        data: [femaleCount, maleCount, nbCount],
        backgroundColor: [CHART.pink, CHART.info, CHART.purple],
        borderColor: CHART.surface,
        borderWidth: 2,
        hoverOffset: 4
      }
    ]
  };

  // Every chart in the console shares one axis, grid and tooltip treatment.
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 420 },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { color: CHART.tick, font: axisTickFont, padding: 6 },
        grid: { color: CHART.grid, drawTicks: false },
        border: { display: false }
      },
      x: {
        ticks: { color: CHART.tick, font: axisTickFont },
        grid: { display: false },
        border: { display: false }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: tooltipTheme
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    animation: { duration: 420 },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: CHART.tick,
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 7,
          padding: 14,
          font: axisTickFont
        }
      },
      tooltip: tooltipTheme
    }
  };

  return (
    <div className="section-stack">
      {/* 6 Key Executive Metrics */}
      <div className="grid grid--kpi">
        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Total Headcount</span>
            <Users size={16} className="text-primary" />
          </div>
          <div className="kpi-value">{totalHeadcount}</div>
          <div className="kpi-sub">
            <span className="text-success">{activeCount} Active</span> • {probationCount} Probation
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Monthly Payroll CTC</span>
            <CreditCard size={16} className="text-success" />
          </div>
          <div className="kpi-value text-success">
            {formatCrores(totalMonthlyPayroll)}
          </div>
          <div className="kpi-sub">
            Avg CTC: {formatLakhs(avgMonthlyCTC * 12)} / year
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Attendance Rate</span>
            <CalendarCheck size={16} className="text-info" />
          </div>
          <div className="kpi-value text-info">{avgAttendance}%</div>
          <div className="kpi-sub">
            Standard 26-Day Cycle
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Annual Attrition Rate</span>
            <TrendingDown size={16} className="text-warning" />
          </div>
          <div className="kpi-value text-warning">1.4%</div>
          <div className="kpi-sub">
            Below 3.5% Tech Industry Avg
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Gender Diversity</span>
            <Sparkles size={16} className="text-pink" />
          </div>
          <div className="kpi-value text-pink">{femaleRatio}%</div>
          <div className="kpi-sub">
            {femaleCount} Female • {maleCount} Male
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Star Performers</span>
            <Award size={16} className="text-purple" />
          </div>
          <div className="kpi-value text-purple">
            {employees.filter(e => e.performanceRating === 5).length}
          </div>
          <div className="kpi-sub">
            Rating: 5 / 5 (Outstanding)
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid--half">
        <div className="omni-card chart-card" style={{ height: '340px' }}>
          <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-4)' }}>
            Headcount by Department
          </h3>
          <div className="chart-body">
            <Bar data={headcountChartData} options={chartOptions} />
          </div>
        </div>

        <div className="omni-card chart-card" style={{ height: '340px' }}>
          <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-4)' }}>
            Monthly Payroll Spend by Department (₹ Lakhs)
          </h3>
          <div className="chart-body">
            <Bar data={payrollChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Secondary Row: Doughnut Breakdown & Top Performers */}
      <div className="grid grid--split">
        <div className="omni-card chart-card" style={{ height: '300px' }}>
          <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-3)' }}>
            Workforce Status Split
          </h3>
          <div className="chart-body">
            <Doughnut data={statusDoughnutData} options={doughnutOptions} />
          </div>
        </div>

        <div className="omni-card chart-card" style={{ height: '300px' }}>
          <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-3)' }}>
            Gender Demographics
          </h3>
          <div className="chart-body">
            <Doughnut data={diversityDoughnutData} options={doughnutOptions} />
          </div>
        </div>

        <div className="omni-card">
          <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--gap-micro)' }}>
            <Award size={16} className="text-purple" /> High Potential & Top Talent
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {topPerformers.length === 0 && (
              <p className="empty-cell">No five-star ratings in the current filter.</p>
            )}
            {topPerformers.map(emp => (
              <button
                key={emp.id}
                type="button"
                onClick={() => onSelectEmployee(emp)}
                className="entity-row"
              >
                <div>
                  <div className="entity-row__name">{emp.name}</div>
                  <div className="entity-row__meta">{emp.role} • {emp.department}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="badge badge-purple">★ 5.0 Rating</span>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '3px' }}>
                    ₹{formatINR(emp.monthlyCTC)}/mo
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
