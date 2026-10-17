import type { HRPolicy } from '../types';

export const MATERNAL_GIFT_PRESETS = [
  'Newborn Deluxe Welcome Hamper (worth ₹15,000)',
  'Baby Care Essentials Stash & Diaper Caddy (worth ₹12,000)',
  'Direct Cash Wellness Grant (₹25,000 to payroll)',
  'Mother & Child Healthcare Insurance Booster (₹3 Lakhs)',
  'Ergonomic Nursing Chair & Feeding Pillow Set (worth ₹18,000)',
  'Postpartum Wellness & Nutrition Basket (worth ₹10,000)',
  'First-Year Pediatric Telehealth Subscription',
  'Organic Baby Clothing & Crib Stash (worth ₹10,000)',
  'None / Standard Compliance Only'
];

export const PATERNAL_GIFT_PRESETS = [
  'New Father Celebration Kit & Diaper Bag Essentials (worth ₹10,000)',
  'Paternity Care Package & Milestone Keepsake (worth ₹8,000)',
  'Direct Cash Family Grant (₹15,000 to payroll)',
  'Gourmet Family Feast Dining Voucher (worth ₹7,500)',
  'Baby Monitor & Smart Nursery Gadget Set (worth ₹12,000)',
  'Dad & Baby Bonding Wellness Kit (worth ₹6,000)',
  'None / Standard Compliance Only'
];

export const MARRIAGE_GIFT_PRESETS = [
  'Luxury Weekend Retreat & Resort Stay Voucher (worth ₹25,000)',
  'Corporate Silver Congratulatory Shield & Memento',
  'Home Appliances & Lifestyle Gift Card (worth ₹20,000)',
  'Direct Cash Congratulatory Grant (₹20,000 to payroll)',
  'Fine Dining & Couples Spa Experience Package',
  'None / Standard Compliance Only'
];

export const SABBATICAL_PROVISION_PRESETS = [
  'Full Job & Role Band Protection Guarantee with Retained ESOPs',
  'Partial Health Insurance Coverage Continuity Option',
  'Higher Education / Upskilling Grant (up to ₹2 Lakhs on rejoining)',
  'Unpaid Sabbatical with Retained Seniority Ranking',
  'None'
];

export const GENERAL_PERK_PRESETS = [
  'Annual Learning & Development Grant (₹50,000)',
  'Home Office Ergonomic Workstation Reimbursement (₹25,000)',
  'Monthly Wellness & Fitness Membership Stipend (₹3,000/mo)',
  'Comprehensive Mental Health & Therapy Sessions Access',
  'Relocation Assistance & Temporary Transit Accommodation',
  'Pet Care & Adoption Settling-In Grant (₹10,000)'
];

export const INITIAL_POLICIES: HRPolicy[] = [
  {
    id: 'POL-MAT',
    title: 'Maternal Provision Policy (Maternity Leave & Benefits)',
    category: 'Parental Provisions',
    shortDesc: 'Comprehensive maternity benefits complying with Maternity Benefit (Amendment) Act 2017 with newborn gifts and nursing support.',
    daysAllowed: 182,
    timeUnit: 'Days',
    isPaid: true,
    giftOrPerk: 'Newborn Deluxe Welcome Hamper (worth ₹15,000)',
    giftOptions: MATERNAL_GIFT_PRESETS,
    eligibility: 'All female and birthing employees who have completed at least 80 days of continuous service.',
    statutoryReference: 'Maternity Benefit (Amendment) Act 2017 (Section 5)',
    rules: [
      'Entitled to 26 weeks (182 days) fully paid maternity leave for up to the first 2 surviving children (12 weeks for 3rd child onwards).',
      'Can be initiated up to 8 weeks prior to expected delivery date, with the remaining 18 weeks availed post-delivery.',
      'Additional 30 days of paid illness leave available for medically certified pregnancy complications.',
      'Corporate newborn welcome gift dispatched to residential address upon birth intimation.',
      'Flexible Work-From-Home (WFH) transition option available upon completion of 26 weeks based on mutual agreement.',
      'Mandatory 4 nursing breaks per day until the child attains 15 months of age, with full access to company creche facilities or ₹5,000/mo creche allowance.'
    ],
    isActive: true,
    isCustom: false
  },
  {
    id: 'POL-PAT',
    title: 'Paternal Provision Policy (Paternity Leave & Family Care)',
    category: 'Parental Provisions',
    shortDesc: 'Paid paternity leave, flexible utilization window, and celebratory welcome kit for new fathers.',
    daysAllowed: 15,
    timeUnit: 'Days',
    isPaid: true,
    giftOrPerk: 'New Father Celebration Kit & Diaper Bag Essentials (worth ₹10,000)',
    giftOptions: PATERNAL_GIFT_PRESETS,
    eligibility: 'All confirmed and probationary full-time male or non-birthing employees upon childbirth or legal adoption.',
    statutoryReference: 'Corporate Progressive Family Policy Framework (Tech Industry Benchmark)',
    rules: [
      '15 business days of 100% fully paid paternity leave.',
      'Must be availed within 180 calendar days (6 months) of childbirth or legal adoption completion.',
      'Can be taken as a continuous 15-day block or split into up to 2 distinct tranches.',
      'Does not deduct from regular Casual, Sick, or Privilege Leave balances.',
      'Corporate New Father Celebration Kit delivered upon submission of birth certificate.',
      'Additional 5 days of remote work flexibility provided immediately upon returning from paternity leave.'
    ],
    isActive: true,
    isCustom: false
  },
  {
    id: 'POL-CAS',
    title: 'Casual Leave Policy (CL)',
    category: 'Leave & Quotas',
    shortDesc: 'Short-term paid leave quota for unforeseen urgent personal, domestic, or religious matters.',
    daysAllowed: 12,
    timeUnit: 'Days',
    isPaid: true,
    giftOrPerk: 'None',
    eligibility: 'All active full-time staff (credited 1 day per month or pro-rated annually).',
    statutoryReference: 'Model Standing Orders & State Shops and Commercial Establishments Acts',
    rules: [
      '12 days credited annually on 1st January for urgent personal or domestic obligations.',
      'Maximum 3 consecutive working days allowed in a single instance.',
      'Does not require medical certification or formal proof.',
      'Cannot be prefixed or suffixed with Privilege Leave (EL) without prior HOD sign-off.',
      'Lapses on 31st December each year. Cannot be accumulated, encashed, or carried over.'
    ],
    isActive: true,
    isCustom: false
  },
  {
    id: 'POL-SCK',
    title: 'Sick & Medical Leave Policy (SL)',
    category: 'Leave & Quotas',
    shortDesc: 'Medical recuperation leave ensuring income continuity during sickness or injury.',
    daysAllowed: 12,
    timeUnit: 'Days',
    isPaid: true,
    giftOrPerk: 'None',
    eligibility: 'All employees effective from Day 1 of joining.',
    statutoryReference: 'State Shops & Establishments Act / Industrial Employment Rules',
    rules: [
      '12 days credited annually to support health recovery and medical treatment.',
      'Medical certificate from a registered medical practitioner required for illness exceeding 2 consecutive working days.',
      'Unutilized sick leave can be accumulated up to a lifetime ceiling of 30 days.',
      'Sick leave is non-encashable during active service or at separation.'
    ],
    isActive: true,
    isCustom: false
  },
  {
    id: 'POL-EL',
    title: 'Privilege / Earned Leave Policy (EL)',
    category: 'Leave & Quotas',
    shortDesc: 'Annual paid vacation entitlement with separation encashment benefits.',
    daysAllowed: 15,
    timeUnit: 'Days',
    isPaid: true,
    giftOrPerk: 'None',
    eligibility: 'Confirmed employees and probationers after completing 90 days of service.',
    statutoryReference: 'The Factories Act 1948 / State Commercial Establishments Act',
    rules: [
      '15 working days credited annually (accrued at 3.75 days per completed quarter).',
      'Requires minimum 7 days advance application and reporting manager approval.',
      'Encashable upon separation (resignation, retirement, retrenchment) calculated as (Basic / 30) * Accumulated Days.',
      'Accumulation capped at 45 days. Any excess balance beyond 45 days is automatically encashed at fiscal year-end.'
    ],
    isActive: true,
    isCustom: false
  },
  {
    id: 'POL-NOT',
    title: 'Separation & Notice Period Policy',
    category: 'Separation & Notice',
    shortDesc: 'Structured resignation and termination notice requirements, buyout clauses, and handover guidelines.',
    daysAllowed: 60,
    timeUnit: 'Days',
    isPaid: true,
    giftOrPerk: 'None',
    eligibility: 'All permanent staff (30 days during probation, 60 days confirmed, 90 days for VP+).',
    statutoryReference: 'Industrial Employment (Standing Orders) Act / Standard Employment Contract',
    rules: [
      'Standard 60 calendar days notice for confirmed personnel; 30 days for probationers; 90 days for Directors & Executive Leadership.',
      'Notice period buyout is permissible solely upon mutual written approval, evaluated on Monthly Basic Salary.',
      'Garden Leave clause may be enforced by the organization to safeguard proprietary intellectual property and confidential client engagements.',
      'Full & Final (F&F) settlement and relieving letter issued within 30 days following formal knowledge transfer (KT) completion.'
    ],
    isActive: true,
    isCustom: false
  },
  {
    id: 'POL-SAB',
    title: 'Sabbatical & Extended Career Break Policy',
    category: 'Extended & Sabbatical',
    shortDesc: 'Long-term career break for higher education, certified research, or family caregiving with guaranteed re-entry.',
    daysAllowed: 180,
    timeUnit: 'Days',
    isPaid: false,
    giftOrPerk: 'Full Job & Role Band Protection Guarantee with Retained ESOPs',
    giftOptions: SABBATICAL_PROVISION_PRESETS,
    eligibility: 'Permanent employees with at least 3 continuous years of service and appraisal rating >= 3.0.',
    statutoryReference: 'Enterprise Talent Retention & Lifelong Learning Framework',
    rules: [
      'Unpaid extended leave of absence ranging from 90 days (3 months) up to 365 days (1 year).',
      'Approved purposes: Accredited post-graduate studies, academic research, public service fellowships, or critical elder/child caregiving.',
      'Guaranteed role re-entry at equivalent designation and compensation band upon agreed resumption date.',
      'Employee stock option (ESOP) vesting remains intact throughout the sabbatical break.',
      'Employee must provide minimum 45 days written notice confirming resumption date prior to return.'
    ],
    isActive: true,
    isCustom: false
  },
  {
    id: 'POL-BER',
    title: 'Compassionate & Bereavement Leave Policy',
    category: 'Leave & Quotas',
    shortDesc: 'Supportive paid leave for mourning and executing final rites for immediate family members.',
    daysAllowed: 5,
    timeUnit: 'Days',
    isPaid: true,
    giftOrPerk: 'None',
    eligibility: 'All employees effective from date of joining.',
    statutoryReference: 'Corporate Compassionate Welfare Mandate',
    rules: [
      '5 business days of 100% fully paid leave granted on the demise of immediate family members (spouse, child, parent, sibling, grandparent, parent-in-law).',
      'Additional 2 travel days granted if funeral ceremonies require travel exceeding 500 km from base office.',
      'Does not deduct from annual CL, SL, or EL balances.'
    ],
    isActive: true,
    isCustom: false
  },
  {
    id: 'POL-MAR',
    title: 'Marriage Congratulatory Policy & Wedding Leave',
    category: 'Wellness & Special Perks',
    shortDesc: 'Paid wedding leave and luxury celebration gifts for employees celebrating their marriage.',
    daysAllowed: 5,
    timeUnit: 'Days',
    isPaid: true,
    giftOrPerk: 'Luxury Weekend Retreat & Resort Stay Voucher (worth ₹25,000)',
    giftOptions: MARRIAGE_GIFT_PRESETS,
    eligibility: 'All confirmed full-time staff getting legally married (applicable once during employment tenure).',
    statutoryReference: 'Corporate Culture & Family Celebrations Scheme',
    rules: [
      '5 consecutive working days of fully paid wedding leave.',
      'Can be clubbed with Privilege Leave (EL) for extended honeymoon or travel arrangements.',
      'Company provides celebratory wedding gift package delivered directly to employee residence.',
      'Marriage certificate or wedding invitation must be submitted within 30 days of rejoining.'
    ],
    isActive: true,
    isCustom: false
  },
  {
    id: 'POL-CST-01',
    title: 'Menstrual Wellness & Healthcare Leave (Custom Rule)',
    category: 'Custom Rules',
    shortDesc: 'Monthly restorative paid day for female and non-binary employees experiencing acute menstrual pain or discomfort.',
    daysAllowed: 12,
    timeUnit: 'Days',
    isPaid: true,
    giftOrPerk: 'Monthly Wellness & Fitness Membership Stipend (₹3,000/mo)',
    giftOptions: GENERAL_PERK_PRESETS,
    eligibility: 'All female and non-binary staff across all locations.',
    statutoryReference: 'Corporate Diversity, Equity & Workplace Wellbeing Standard',
    rules: [
      '1 day of fully paid menstrual leave per calendar month (up to 12 days annually).',
      'Can be taken as a full day or two half-day blocks on days of peak discomfort.',
      'No medical certificate or prescription is required. Zero questions asked policy.',
      'Does not deduct from standard Casual Leave (CL) or Sick Leave (SL) quotas.'
    ],
    isActive: true,
    isCustom: true
  }
];
