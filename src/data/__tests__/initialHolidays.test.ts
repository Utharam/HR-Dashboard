import { describe, it, expect } from 'vitest';
import { createInitialHolidays } from '../initialHolidays';

describe('createInitialHolidays', () => {
  it('seeds the five fixed 2026 national holidays', () => {
    const holidays = createInitialHolidays();

    expect(holidays).toEqual([
      { id: 'holiday-2026-01-01', date: '2026-01-01', name: 'New Year' },
      { id: 'holiday-2026-01-26', date: '2026-01-26', name: 'Republic Day' },
      { id: 'holiday-2026-08-15', date: '2026-08-15', name: 'Independence Day' },
      { id: 'holiday-2026-10-02', date: '2026-10-02', name: 'Gandhi Jayanti' },
      { id: 'holiday-2026-12-25', date: '2026-12-25', name: 'Christmas' },
    ]);
  });

  it('accepts 2026 explicitly', () => {
    expect(createInitialHolidays(2026)).toEqual(createInitialHolidays());
  });

  it('keeps every id in the holiday-<date> form', () => {
    for (const holiday of createInitialHolidays(2026)) {
      expect(holiday.id).toBe(`holiday-${holiday.date}`);
    }
  });

  it('has unique dates', () => {
    const dates = createInitialHolidays(2026).map((holiday) => holiday.date);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('stamps recurring dates onto a requested year', () => {
    const dates = createInitialHolidays(2027).map((holiday) => holiday.date);
    expect(dates).toEqual([
      '2027-01-01',
      '2027-01-26',
      '2027-08-15',
      '2027-10-02',
      '2027-12-25',
    ]);
  });
});
