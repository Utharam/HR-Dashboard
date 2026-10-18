import React, { useState, useMemo } from 'react';
import { 
  Baby, 
  Gift, 
  HeartHandshake, 
  CalendarCheck, 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  RotateCcw, 
  Check, 
  X, 
  SlidersHorizontal,
  BookmarkCheck
} from 'lucide-react';
import type { HRPolicy, PolicyCategory } from '../types';
import { PolicyModal } from './PolicyModal';
import { ConfirmDialog } from './ConfirmDialog';

interface PolicySectionProps {
  policies: HRPolicy[];
  onUpdatePolicy: (policy: HRPolicy) => void;
  onAddPolicy: (policy: HRPolicy) => void;
  onDeletePolicy: (id: string) => void;
  onResetPolicies: () => void;
}

/**
 * A destructive request waiting for an answer. Both destructive actions in this section used
 * to be blocking native prompts; holding the request as state lets one themed dialog serve
 * either of them, and lets the dialog name what is about to be lost.
 */
type PendingAction = { kind: 'reset' } | { kind: 'delete'; id: string; title: string };

export const PolicySection: React.FC<PolicySectionProps> = ({
  policies,
  onUpdatePolicy,
  onAddPolicy,
  onDeletePolicy,
  onResetPolicies
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<HRPolicy | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  // Statistics
  const activeCount = policies.filter(p => p.isActive).length;
  const maternalPolicy = policies.find(p => p.id === 'POL-MAT');
  const paternalPolicy = policies.find(p => p.id === 'POL-PAT');
  const customCount = policies.filter(p => p.isCustom).length;

  const categories: { label: string; value: string }[] = [
    { label: 'All Policies', value: 'ALL' },
    { label: 'Parental Provisions', value: 'Parental Provisions' },
    { label: 'Leave & Quotas', value: 'Leave & Quotas' },
    { label: 'Separation & Notice', value: 'Separation & Notice' },
    { label: 'Extended & Sabbatical', value: 'Extended & Sabbatical' },
    { label: 'Wellness & Perks', value: 'Wellness & Special Perks' },
    { label: 'Custom Rules', value: 'Custom Rules' },
  ];

  const filteredPolicies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return policies.filter(p => {
      const matchCat = selectedCategory === 'ALL' || p.category === selectedCategory;
      const matchSearch = !q || 
        p.title.toLowerCase().includes(q) ||
        p.shortDesc.toLowerCase().includes(q) ||
        p.eligibility.toLowerCase().includes(q) ||
        (p.giftOrPerk && p.giftOrPerk.toLowerCase().includes(q)) ||
        (p.statutoryReference && p.statutoryReference.toLowerCase().includes(q)) ||
        p.rules.some(r => r.toLowerCase().includes(q));

      return matchCat && matchSearch;
    });
  }, [policies, selectedCategory, searchQuery]);

  const handleOpenCreateModal = () => {
    setEditingPolicy(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: HRPolicy) => {
    setEditingPolicy(p);
    setIsModalOpen(true);
  };

  const handleToggleActive = (policy: HRPolicy) => {
    onUpdatePolicy({
      ...policy,
      isActive: !policy.isActive
    });
  };

  const handleQuickGiftChange = (policy: HRPolicy, newGift: string) => {
    onUpdatePolicy({
      ...policy,
      giftOrPerk: newGift
    });
  };

  const pendingDelete = pending?.kind === 'delete' ? pending : null;

  const handleConfirmPending = () => {
    if (pendingDelete) onDeletePolicy(pendingDelete.id);
    else onResetPolicies();
    setPending(null);
  };

const getCategoryIcon = (category: PolicyCategory) => {
    switch (category) {
      case 'Parental Provisions': return <Baby size={18} className="text-pink" />;
      case 'Leave & Quotas': return <CalendarCheck size={18} className="text-primary" />;
      case 'Separation & Notice': return <Clock size={18} className="text-warning" />;
      case 'Extended & Sabbatical': return <HeartHandshake size={18} className="text-purple" />;
      case 'Wellness & Special Perks': return <Gift size={18} className="text-success" />;
      default: return <Sparkles size={18} className="text-info" />;
    }
  };

  return (
    <div className="section-stack">
      {/* 5 KPI Summary Cards */}
      <div className="grid grid--kpi-lg">
        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Active HR Policies</span>
            <BookmarkCheck size={18} className="text-primary" />
          </div>
          <div className="kpi-value">
            {activeCount} <span className="kpi-value__unit">/ {policies.length} Active</span>
          </div>
          <div className="kpi-sub">
            Enforced across all 5 hubs
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Maternal Leave</span>
            <Baby size={18} className="text-pink" />
          </div>
          <div className="kpi-value text-pink">
            {maternalPolicy?.daysAllowed ?? 182} Days
          </div>
          <div className="kpi-sub">
            26 Weeks (100% Fully Paid)
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Paternal Leave</span>
            <HeartHandshake size={18} className="text-purple" />
          </div>
          <div className="kpi-value text-purple">
            {paternalPolicy?.daysAllowed ?? 15} Days
          </div>
          <div className="kpi-sub">
            Availed within 180 days
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Paid Leave Quota</span>
            <CalendarCheck size={18} className="text-success" />
          </div>
          <div className="kpi-value text-success">
            39 Days
          </div>
          <div className="kpi-sub">
            12 CL • 12 SL • 15 EL
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Custom Rules</span>
            <Sparkles size={18} className="text-info" />
          </div>
          <div className="kpi-value text-info">
            {customCount} Custom
          </div>
          <div className="kpi-sub">
            Enterprise tailored rules
          </div>
        </div>
      </div>

      {/* Control & Filter Bar */}
      <div className="omni-card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          {/* Category Filter Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--gap-inline)' }}>
            {categories.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setSelectedCategory(c.value)}
                aria-pressed={selectedCategory === c.value}
                className="pill"
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Action Buttons & Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ width: '220px' }}>
              <label className="omni-icon-field">
                <Search size={15} />
                <span className="sr-only">Search policies</span>
                <input
                  type="text"
                  className="omni-input"
                  placeholder="Search policy, terms, gift..."
                  aria-label="Search policies"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </label>
            </div>

            <button onClick={handleOpenCreateModal} className="btn btn-primary">
              <Plus size={16} /> Add Custom Rule
            </button>

            <button 
              onClick={() => setPending({ kind: 'reset' })}
              className="btn btn-secondary"
              title="Reset to default policies"
            >
              <RotateCcw size={15} /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* Policy Cards Grid */}
      <div className="grid grid--card">
        {filteredPolicies.map(policy => (
          <div 
            key={policy.id} 
            className="omni-card" 
            style={{ 
              display: 'flex', 
              flexDirection: 'column',
              justifyContent: 'space-between',
              borderLeft: policy.isActive ? '3px solid var(--primary)' : '3px solid var(--text-dim)',
              opacity: policy.isActive ? 1 : 0.65
            }}
          >
            <div style={{ minWidth: 0, maxWidth: '100%' }}>
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {getCategoryIcon(policy.category)}
                  <span className="badge badge-primary">
                    {policy.category}
                  </span>
                  {policy.isCustom && (
                    <span className="badge badge-info">
                      Custom Rule
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-inline)' }}>
                  <button 
                    type="button"
                    onClick={() => handleToggleActive(policy)}
                    className={`toggle-chip ${policy.isActive ? 'toggle-chip--on' : 'toggle-chip--off'}`}
                    title={policy.isActive ? 'Click to disable policy' : 'Click to enable policy'}
                  >
                    {policy.isActive ? <Check size={12} /> : <X size={12} />}
                    {policy.isActive ? 'Active' : 'Disabled'}
                  </button>
                </div>
              </div>

              {/* Title & Duration */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: 'var(--gap-micro)' }}>
                <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-extrabold)', color: 'var(--text-bright)', letterSpacing: 'var(--tracking-display)', lineHeight: 'var(--lh-tight)', wordBreak: 'break-word' }}>
                  {policy.title}
                </h3>
              </div>

              {/* Duration and Paid Tags */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
                <span className="badge badge-active" style={{ fontSize: 'var(--fs-xs)' }}>
                  <Clock size={12} /> {policy.daysAllowed} {policy.timeUnit || 'Days'}
                </span>
                <span className={`badge ${policy.isPaid ? 'badge-primary' : 'badge-notice'}`} style={{ fontSize: 'var(--fs-xs)' }}>
                  {policy.isPaid ? '100% Fully Paid' : 'Unpaid Leave'}
                </span>
                {policy.statutoryReference && (
                  <span className="meta-note">
                    <ShieldCheck size={12} className="text-primary" /> {policy.statutoryReference}
                  </span>
                )}
              </div>

              <p className="prose" style={{ marginBottom: 'var(--space-3)' }}>
                {policy.shortDesc}
              </p>

              {/* Gift / Perk / Family Provision Box */}
              {policy.giftOrPerk && policy.giftOrPerk !== 'None' && (
                <div className="gift-panel">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--gap-micro)' }}>
                    <Gift size={16} className="text-pink" />
                    <span className="gift-panel__label">
                      Corporate Gift & Allowance Package:
                    </span>
                  </div>

                  <div className="gift-panel__value">
                    {policy.giftOrPerk}
                  </div>

                  {/* Quick Gift Options Selector if presets available */}
                  {policy.giftOptions && policy.giftOptions.length > 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-micro)', width: '100%', minWidth: 0 }}>
                      <span className="omni-label">Select Package:</span>
                      <select 
                        className="omni-select" 
                        style={{ 
                          fontSize: 'var(--fs-xs)', 
                          padding: '6px 8px', 
                          width: '100%', 
                          background: 'var(--bg-card)'
                        }}
                        value={policy.giftOrPerk}
                        onChange={(e) => handleQuickGiftChange(policy, e.target.value)}
                        title={policy.giftOrPerk}
                      >
                        {policy.giftOptions.map((opt, idx) => (
                          <option key={idx} value={opt} title={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Eligibility */}
              <div className="eligibility">
                <strong>Eligibility:</strong> {policy.eligibility}
              </div>

              {/* Rule Clauses List */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
                <span className="kpi-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                  Operational Rules & Terms:
                </span>
                <ul className="rule-list">
                  {policy.rules.map((rule, idx) => (
                    <li key={idx}>
                      <span className="rule-list__mark">✓</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Card Footer Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--gap-inline)', marginTop: 'var(--space-5)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
              <button 
                onClick={() => handleOpenEditModal(policy)}
                className="btn btn-secondary btn-sm" 
              >
                <Edit3 size={13} /> Edit Terms
              </button>

              {policy.isCustom && (
                <button 
                  onClick={() => setPending({ kind: 'delete', id: policy.id, title: policy.title })}
                  className="btn btn-danger btn-sm"
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
            </div>
          </div>
        ))}

        {filteredPolicies.length === 0 && (
          <div className="omni-card empty-state" style={{ gridColumn: '1 / -1' }}>
            <SlidersHorizontal size={36} className="text-dim" style={{ margin: '0 auto 12px' }} />
            <h4 className="empty-state__title">
              No policies found matching filter criteria
            </h4>
            <p className="empty-state__body">
              Try clearing your search query or selecting "All Policies".
            </p>
            <button 
              onClick={() => { setSelectedCategory('ALL'); setSearchQuery(''); }}
              className="btn btn-secondary"
            >
              Reset Category Filter
            </button>
          </div>
        )}
      </div>

      {/* Edit / Create Policy Modal */}
      <PolicyModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSavePolicy={(saved) => {
          if (editingPolicy) {
            onUpdatePolicy(saved);
          } else {
            onAddPolicy(saved);
          }
        }}
        policyToEdit={editingPolicy}
      />

      {/*
        One dialog for both destructive actions. The reset message is the one the native
        prompt could never give: not "are you sure?" but what specifically is destroyed and
        that it cannot be brought back, because a custom policy the user spent an afternoon
        writing is not recoverable by resetting a filter.
      */}
      <ConfirmDialog
        isOpen={pending !== null}
        title={
          pendingDelete
            ? `Delete the custom policy "${pendingDelete.title}"?`
            : 'Reset all policies to the corporate defaults?'
        }
        message={
          pendingDelete
            ? `"${pendingDelete.title}" will be removed from the policy register. It cannot be recovered once deleted.`
            : 'Every custom policy you added or edited will be lost, and the statutory maternity, paternity, leave-quota, sabbatical and gift policies will be restored to their defaults. Custom policies cannot be recovered afterwards.'
        }
        confirmLabel={pendingDelete ? 'Delete policy' : 'Reset all policies'}
        onConfirm={handleConfirmPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
};
