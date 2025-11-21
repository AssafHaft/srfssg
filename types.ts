export enum ShiftType {
  DAY = 'DAY',
  NIGHT = 'NIGHT'
}

export enum WorkerPreference {
  DAY_ONLY = 'Day Only',
  NIGHT_ONLY = 'Night Only',
  EITHER = 'Either'
}

export interface Availability {
  // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  daysOff: number[]; 
}

export interface Employee {
  id: string;
  name: string;
  preference: WorkerPreference;
  availability: Availability;
  color: string; // For UI visualization
}

export interface ShiftConfig {
  dayStartTime: string;
  dayEndTime: string;
  nightStartTime: string;
  nightEndTime: string;
  // New feature flag
  distributeDayShiftsToEither?: boolean;
  // Maps day of week (0-6) to number of workers needed
  requirements: {
    [key: number]: {
      day: number;
      night: number;
    }
  };
}

export interface ShiftAssignment {
  shiftType: ShiftType;
  employeeId: string;
}

export interface DailySchedule {
  date: string; // ISO date string YYYY-MM-DD
  dayShift: string[]; // Employee IDs
  nightShift: string[]; // Employee IDs
}

export interface ScheduleVersion {
  id: string;
  timestamp: number;
  name: string;
  month: number; // 0-11
  year: number;
  schedule: DailySchedule[];
  stats: Record<string, EmployeeStats>; // EmployeeId -> Stats
}

export interface EmployeeStats {
  totalShifts: number;
  dayShifts: number;
  nightShifts: number;
  longestStreak: number;
}

export interface HistoricalContext {
  // ID of employees who worked the Night shift on the very last day of the previous month
  lastDayNightShiftIds: string[];
  // Stats carried over (Employee ID -> counts)
  accumulatedStats: Record<string, { day: number, night: number, total: number }>;
  // Consecutive days worked leading up to the end of the previous month (Employee ID -> count)
  consecutiveDaysEnding: Record<string, number>;
  // Name of the file or context
  sourceName: string;
}

export interface AppState {
  employees: Employee[];
  config: ShiftConfig;
  versions: ScheduleVersion[];
  currentVersionId: string | null;
}