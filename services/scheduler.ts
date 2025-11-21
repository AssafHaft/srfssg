import { 
  Employee, 
  ShiftConfig, 
  DailySchedule, 
  ShiftType, 
  WorkerPreference, 
  EmployeeStats,
  ScheduleVersion,
  HistoricalContext
} from '../types';

// Helper to get days in a month
export const getDaysInMonth = (year: number, month: number): Date[] => {
  const date = new Date(year, month, 1);
  const days: Date[] = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

// Helper to format date as YYYY-MM-DD
export const formatDateKey = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// --- Parsing History CSV ---
export const parsePastScheduleCSV = async (file: File, employees: Employee[]): Promise<HistoricalContext> => {
  const text = await file.text();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  if (lines.length < 2) throw new Error("Invalid CSV format");

  // 1. Parse Headers to identify columns
  // Remove BOM if present
  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const headers = headerLine.split(',');
  
  const dayCols: number[] = [];
  const nightCols: number[] = [];

  headers.forEach((h, idx) => {
    const lower = h.toLowerCase().replace(/"/g, '');
    if (lower.includes('day shift worker') || lower.includes('day worker')) dayCols.push(idx);
    if (lower.includes('night shift worker') || lower.includes('night worker')) nightCols.push(idx);
  });

  // Maps to track
  const accumulatedStats: Record<string, { day: number, night: number, total: number }> = {};
  const consecutiveDays: Record<string, number> = {};
  let lastDayNightShiftIds: string[] = [];

  // Initialize for all current employees
  employees.forEach(e => {
    accumulatedStats[e.id] = { day: 0, night: 0, total: 0 };
    consecutiveDays[e.id] = 0;
  });

  // Helper to find ID by name
  const findId = (nameRaw: string): string | undefined => {
    const name = nameRaw.replace(/"/g, '').trim();
    if (!name) return undefined;
    return employees.find(e => e.name.toLowerCase() === name.toLowerCase())?.id;
  };

  // 2. Process Rows
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    // Handle CSV split respecting quotes is complex, but given our simple export, split(',') usually works 
    // unless names have commas. A simple regex split is safer for quoted CSVs.
    const cells = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
    const cleanCells = cells.map(c => c.replace(/^"|"$/g, '').trim()); // Remove quotes

    // Track who worked TODAY to calculate consecutive streaks
    const workedTodayIds: string[] = [];
    const nightTodayIds: string[] = [];

    // Process Day Shifts
    dayCols.forEach(colIdx => {
      if (colIdx < cleanCells.length) {
        const id = findId(cleanCells[colIdx]);
        if (id) {
          accumulatedStats[id].day++;
          accumulatedStats[id].total++;
          workedTodayIds.push(id);
        }
      }
    });

    // Process Night Shifts
    nightCols.forEach(colIdx => {
      if (colIdx < cleanCells.length) {
        const id = findId(cleanCells[colIdx]);
        if (id) {
          accumulatedStats[id].night++;
          accumulatedStats[id].total++;
          workedTodayIds.push(id);
          nightTodayIds.push(id);
        }
      }
    });

    // Update Consecutive Logic
    employees.forEach(e => {
      if (workedTodayIds.includes(e.id)) {
        consecutiveDays[e.id] = (consecutiveDays[e.id] || 0) + 1;
      } else {
        consecutiveDays[e.id] = 0;
      }
    });

    // If this is the last row, save night workers
    if (i === lines.length - 1) {
      lastDayNightShiftIds = nightTodayIds;
    }
  }

  return {
    sourceName: file.name,
    accumulatedStats,
    consecutiveDaysEnding: consecutiveDays,
    lastDayNightShiftIds
  };
};

// --- Core Generation Function ---
export const generateSchedule = (
  employees: Employee[],
  year: number,
  month: number,
  config: ShiftConfig,
  history?: HistoricalContext
): ScheduleVersion => {
  const days = getDaysInMonth(year, month);
  const schedule: DailySchedule[] = [];
  
  // Tracking working state for constraints
  // Map<EmployeeID, Array<ISO Date Strings worked>>
  const workHistory = new Map<string, Set<string>>();
  // Map<EmployeeID, LastShiftType | null>
  const lastShiftType = new Map<string, ShiftType | null>();
  // Map<EmployeeID, ConsecutiveDaysCount>
  const consecutiveDays = new Map<string, number>();
  
  // Stats tracking for fairness
  const stats = new Map<string, { day: number, night: number, total: number }>();
  
  // Initialize State (Potentially from History)
  employees.forEach(e => {
    workHistory.set(e.id, new Set());
    
    // Load from history or default to 0
    if (history) {
       const hStats = history.accumulatedStats[e.id] || { day: 0, night: 0, total: 0 };
       stats.set(e.id, { ...hStats }); // Copy values
       
       const hStreak = history.consecutiveDaysEnding[e.id] || 0;
       consecutiveDays.set(e.id, hStreak);
       
       // Note: lastShiftType is handled specifically via history.lastDayNightShiftIds during the first day iteration
       lastShiftType.set(e.id, null); 
    } else {
       stats.set(e.id, { day: 0, night: 0, total: 0 });
       consecutiveDays.set(e.id, 0);
       lastShiftType.set(e.id, null);
    }
  });

  // Iterate through each day of the month
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const dayDate = days[dayIndex];
    const dayOfWeek = dayDate.getDay();
    const reqs = config.requirements[dayOfWeek] || { day: 1, night: 1 };
    const dateKey = formatDateKey(dayDate);
    
    const dailyAssignments: DailySchedule = {
      date: dateKey,
      dayShift: [],
      nightShift: []
    };

    // Special check for First Day: Pass history context for "Day after Night" rule
    const forbiddenDayWorkers = dayIndex === 0 && history 
      ? history.lastDayNightShiftIds 
      : [];

    // --- Assign DAY Shift ---
    const dayWorkers = pickWorkers(
      employees,
      reqs.day,
      dayDate,
      ShiftType.DAY,
      workHistory,
      lastShiftType,
      consecutiveDays,
      stats,
      forbiddenDayWorkers, // Force exclusion if they worked night on last day of prev month
      !!config.distributeDayShiftsToEither // Pass the config flag
    );
    
    dailyAssignments.dayShift = dayWorkers;
    
    // --- Assign NIGHT Shift ---
    const nightWorkers = pickWorkers(
      employees,
      reqs.night,
      dayDate,
      ShiftType.NIGHT,
      workHistory,
      lastShiftType,
      consecutiveDays,
      stats,
      dayWorkers, // Exclude people already working day shift
      false // logic doesn't apply to night shift
    );

    dailyAssignments.nightShift = nightWorkers;
    
    // Update State for next day iteration
    const todayWorkers = [...dayWorkers, ...nightWorkers];
    
    employees.forEach(e => {
      const workedToday = todayWorkers.includes(e.id);
      
      if (workedToday) {
        workHistory.get(e.id)?.add(dateKey);
        consecutiveDays.set(e.id, (consecutiveDays.get(e.id) || 0) + 1);
        
        // Update stats
        const s = stats.get(e.id)!;
        s.total += 1;
        if (dayWorkers.includes(e.id)) {
          lastShiftType.set(e.id, ShiftType.DAY);
          s.day += 1;
        } else {
          lastShiftType.set(e.id, ShiftType.NIGHT);
          s.night += 1;
        }
      } else {
        // Reset consecutive days if they didn't work
        consecutiveDays.set(e.id, 0);
        // Reset last shift type tracker after a day off
        lastShiftType.set(e.id, null); 
      }
    });

    schedule.push(dailyAssignments);
  }

  // Calculate final stats (but only for THIS month for display purposes, 
  // although fairness was calculated based on accumulated)
  const finalStats: Record<string, EmployeeStats> = {};
  
  employees.forEach(e => {
    // We recalculate the stats strictly for this generated month for the report
    // The 'stats' map contains accumulated, which is good for fairness but maybe confusing for "Monthly Report".
    // Let's re-tally just this schedule for the output object.
    
    let monthDay = 0;
    let monthNight = 0;
    let monthTotal = 0;
    let maxStreak = 0;
    let currentStreak = 0;
    
    days.forEach(d => {
      const dKey = formatDateKey(d);
      const daySch = schedule.find(s => s.date === dKey);
      const worked = daySch && (daySch.dayShift.includes(e.id) || daySch.nightShift.includes(e.id));
      
      if (worked) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
        monthTotal++;
        if (daySch.dayShift.includes(e.id)) monthDay++;
        else monthNight++;
      } else {
        currentStreak = 0;
      }
    });

    finalStats[e.id] = {
      totalShifts: monthTotal,
      dayShifts: monthDay,
      nightShifts: monthNight,
      longestStreak: maxStreak
    };
  });

  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    name: `Schedule ${new Date(year, month).toLocaleString('default', { month: 'short' })} ${year}`,
    month,
    year,
    schedule,
    stats: finalStats
  };
};

// Selection Logic
function pickWorkers(
  pool: Employee[],
  count: number,
  date: Date,
  shiftType: ShiftType,
  workHistory: Map<string, Set<string>>,
  lastShiftType: Map<string, ShiftType | null>,
  consecutiveDays: Map<string, number>,
  stats: Map<string, { day: number, night: number, total: number }>,
  excludeIds: string[],
  prioritizeEitherForDay: boolean = false
): string[] {
  const candidates = pool.filter(e => {
    // 0. Exclude if already working today or passed in exclusion list
    if (excludeIds.includes(e.id)) return false;

    // 1. Preference Check
    if (shiftType === ShiftType.DAY && e.preference === WorkerPreference.NIGHT_ONLY) return false;
    if (shiftType === ShiftType.NIGHT && e.preference === WorkerPreference.DAY_ONLY) return false;

    // 2. Availability Check
    if (e.availability.daysOff.includes(date.getDay())) return false;

    // 3. HARD CONSTRAINT: Max 5 consecutive days
    if ((consecutiveDays.get(e.id) || 0) >= 5) return false;

    // 4. HARD CONSTRAINT: No Day after Night
    if (shiftType === ShiftType.DAY) {
        const yesterday = new Date(date);
        yesterday.setDate(date.getDate() - 1);
        const yKey = formatDateKey(yesterday);
        const workedYesterday = workHistory.get(e.id)?.has(yKey);
        
        if (workedYesterday && lastShiftType.get(e.id) === ShiftType.NIGHT) {
            return false;
        }
    }

    return true;
  });

  // Sort candidates by "Fairness"
  candidates.sort((a, b) => {
    const statsA = stats.get(a.id)!;
    const statsB = stats.get(b.id)!;

    let scoreA = statsA.total;
    let scoreB = statsB.total;

    // --- FEATURE: Bias Day Shifts towards "Either" workers ---
    if (prioritizeEitherForDay && shiftType === ShiftType.DAY) {
        if (a.preference === WorkerPreference.EITHER) scoreA -= 2;
        if (b.preference === WorkerPreference.EITHER) scoreB -= 2;
    }

    // 1. Least total shifts first (balance load)
    if (scoreA !== scoreB) {
      return scoreA - scoreB;
    }
    
    // 2. If equal, prefer those who need more of this specific shift type
    if (a.preference === WorkerPreference.EITHER && b.preference === WorkerPreference.EITHER) {
        const aRatio = shiftType === ShiftType.DAY ? statsA.day : statsA.night;
        const bRatio = shiftType === ShiftType.DAY ? statsB.day : statsB.night;
        return aRatio - bRatio;
    }

    // Randomize
    return Math.random() - 0.5;
  });

  return candidates.slice(0, count).map(e => e.id);
}

export const exportToCSV = (version: ScheduleVersion, employees: Employee[]) => {
    // 1. Determine max number of columns needed for day/night workers
    let maxDay = 0;
    let maxNight = 0;
    version.schedule.forEach(s => {
        maxDay = Math.max(maxDay, s.dayShift.length);
        maxNight = Math.max(maxNight, s.nightShift.length);
    });

    // 2. Build Header Row
    const headers = ['Date'];
    for(let i=0; i<maxDay; i++) headers.push(`Day Shift Worker ${i+1}`);
    for(let i=0; i<maxNight; i++) headers.push(`Night Shift Worker ${i+1}`);
    
    // Add BOM for Hebrew support
    let csvContent = "\uFEFF" + headers.join(",") + "\n";

    // 3. Build Rows
    version.schedule.forEach(row => {
        const line = [row.date];
        
        // Fill Day Shift
        for(let i=0; i<maxDay; i++) {
            const id = row.dayShift[i];
            const name = id ? employees.find(e => e.id === id)?.name || 'Unknown' : '';
            // Escape quotes if present
            line.push(`"${name.replace(/"/g, '""')}"`);
        }

        // Fill Night Shift
        for(let i=0; i<maxNight; i++) {
            const id = row.nightShift[i];
            const name = id ? employees.find(e => e.id === id)?.name || 'Unknown' : '';
            line.push(`"${name.replace(/"/g, '""')}"`);
        }

        csvContent += line.join(",") + "\n";
    });

    // Create Blob
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `schedule_${version.month + 1}_${version.year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const exportToExcel = (version: ScheduleVersion, employees: Employee[]) => {
    // 1. Determine max number of columns needed
    let maxDay = 0;
    let maxNight = 0;
    version.schedule.forEach(s => {
        maxDay = Math.max(maxDay, s.dayShift.length);
        maxNight = Math.max(maxNight, s.nightShift.length);
    });

    // Helper to find name
    const getName = (id: string | undefined) => id ? employees.find(e => e.id === id)?.name || 'Unknown' : '';

    // 2. Build Table Header
    let headerCells = `<th style="background-color:#e2e8f0; border:1px solid #94a3b8;">Date</th>`;
    for(let i=0; i<maxDay; i++) headerCells += `<th style="background-color:#fef3c7; border:1px solid #94a3b8;">Day Worker ${i+1}</th>`;
    for(let i=0; i<maxNight; i++) headerCells += `<th style="background-color:#e0e7ff; border:1px solid #94a3b8;">Night Worker ${i+1}</th>`;

    let tableRows = '';
    version.schedule.forEach(row => {
        let rowCells = `<td style="border:1px solid #cbd5e1;">${row.date}</td>`;
        
        // Day columns
        for(let i=0; i<maxDay; i++) {
            rowCells += `<td style="border:1px solid #cbd5e1;">${getName(row.dayShift[i])}</td>`;
        }
        // Night columns
        for(let i=0; i<maxNight; i++) {
            rowCells += `<td style="border:1px solid #cbd5e1;">${getName(row.nightShift[i])}</td>`;
        }
        
        tableRows += `<tr>${rowCells}</tr>`;
    });

    const tableHtml = `
      <table style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; color: #000;">
        <thead>
          <tr>
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;

    // Excel-compatible HTML with strict UTF-8 declaration
    const template = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Schedule</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: Arial, sans-serif; background-color: white; color: black; }
          td, th { text-align: left; vertical-align: top; padding: 5px; }
        </style>
      </head>
      <body>
        ${tableHtml}
      </body>
      </html>
    `;

    const blob = new Blob([template], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `schedule_${version.month + 1}_${version.year}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};