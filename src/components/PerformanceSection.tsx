import React from 'react';
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import { Award, Target, Zap, AlertCircle } from 'lucide-react';
import type { Employee } from '../types';

interface PerformanceSectionProps {
  employees: Employee[];
  onSelectEmployee: (emp: Employee) => void;
}

// Canvas cannot resolve CSS custom properties, so the chart palette is read
// from the token layer once. Change a token in index.css and the charts follow.
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const CHART = {
  danger: token('--danger'),
  warning: token('--warning'),
  info: token('--info'),
  success: token('--success'),
  purple: token('--purple'),
  tick: token('--text-muted'),
  grid: token('--grid-line'),
  font: token('--font-sans')
};

const axisTickFont = { family: CHART.font, size: 11 };

export const PerformanceSection: React.FC<PerformanceSectionProps> = ({
  employees,
  onSelectEmployee
}) => {
  // Count ratings 1 to 5
  const ratingCounts = [1, 2, 3, 4, 5].map(r => 
    employees.filter(e => e.performanceRating === r).length
  );

  const ratingChartData = {
    labels: ['1 - Needs Improvement', '2 - Developing', '3 - Meets Expectations', '4 - Exceeds Expectations', '5 - Outstanding'],
    datasets: [
      {
        label: 'Employees in Rating Tier',
        data: ratingCounts,
        backgroundColor: [CHART.danger, CHART.warning, CHART.info, CHART.success, CHART.purple],
        borderRadius: 6,
        maxBarThickness: 72
      }
    ]
  };

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
        ticks: { color: CHART.tick, font: axisTickFont, maxRotation: 0, autoSkip: false },
        grid: { display: false },
        border: { display: false }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: token('--bg-well'),
        titleColor: token('--text-bright'),
        bodyColor: token('--text-muted'),
        borderColor: token('--border'),
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        titleFont: { family: CHART.font, weight: 600 as const },
        bodyFont: { family: CHART.font }
      }
    }
  };

  // 9-Box Matrix Groupings
  const stars = employees.filter(e => e.performanceRating === 5);
  const highPerformers = employees.filter(e => e.performanceRating === 4);
  const coreTalent = employees.filter(e => e.performanceRating === 3);
  const underPerformers = employees.filter(e => e.performanceRating <= 2);

  return (
    <div className="section-stack">
      {/* 9-Box Overview Grid */}
      <div className="omni-card">
        <h3 className="omni-card-title" style={{ fontSize: 'var(--fs-xl)', marginBottom: 'var(--space-2)' }}>
          Strategic 9-Box Talent & Potential Matrix
        </h3>
        <p className="prose" style={{ marginBottom: 'var(--space-5)' }}>
          Categorization of {employees.length} employees for leadership succession, retention bonuses, and performance coaching.
        </p>

        <div className="grid grid--tile">
          <div className="matrix-tile tone-purple">
            <div className="matrix-tile__head">
              <span className="matrix-tile__label">Future Leaders / Stars</span>
              <Award size={18} className="text-purple-soft" />
            </div>
            <div className="matrix-tile__value">{stars.length}</div>
            <p className="matrix-tile__note">High Performance & High Potential (Eligible for ESOPs & rapid promotion)</p>
          </div>

          <div className="matrix-tile tone-success">
            <div className="matrix-tile__head">
              <span className="matrix-tile__label">High Performers</span>
              <Zap size={18} className="text-success-soft" />
            </div>
            <div className="matrix-tile__value">{highPerformers.length}</div>
            <p className="matrix-tile__note">Consistent overachievers driving departmental goals</p>
          </div>

          <div className="matrix-tile tone-info">
            <div className="matrix-tile__head">
              <span className="matrix-tile__label">Core Backbone</span>
              <Target size={18} className="text-info-soft" />
            </div>
            <div className="matrix-tile__value">{coreTalent.length}</div>
            <p className="matrix-tile__note">Steady contributors meeting operational objectives</p>
          </div>

          <div className="matrix-tile tone-danger">
            <div className="matrix-tile__head">
              <span className="matrix-tile__label">Performance PIP / Coaching</span>
              <AlertCircle size={18} className="text-danger-soft" />
            </div>
            <div className="matrix-tile__value">{underPerformers.length}</div>
            <p className="matrix-tile__note">Enrolled in 90-day performance improvement plan</p>
          </div>
        </div>
      </div>

      {/* Bell Curve Rating Distribution */}
      <div className="omni-card chart-card" style={{ height: '340px' }}>
        <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-3)' }}>
          Annual Appraisal Rating Distribution (Bell Curve Analysis)
        </h3>
        <div className="chart-body">
          <Bar data={ratingChartData} options={chartOptions} />
        </div>
      </div>

      {/* Star Performers Showcase */}
      <div className="omni-card">
        <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-3)' }}>
          Top Rated Employees Showcase
        </h3>
        {stars.length === 0 ? (
          <div className="empty-cell">No employees hold a five-star rating in the current filter.</div>
        ) : (
          <div className="grid grid--list">
            {stars.slice(0, 6).map(emp => (
              <button
                key={emp.id}
                type="button"
                onClick={() => onSelectEmployee(emp)}
                className="entity-row"
              >
                <div>
                  <strong className="entity-row__name">{emp.name}</strong>
                  <div className="entity-row__meta">{emp.role} • {emp.department}</div>
                </div>
                <span className="badge badge-purple">★ 5.0 Star</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
