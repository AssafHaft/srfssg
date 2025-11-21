import React, { useState, useMemo, useCallback } from 'react';
import { 
  Users, 
  Calendar, 
  Settings, 
  History, 
  Plus, 
  Trash2, 
  Download, 
  CheckCircle,
  AlertCircle,
  Menu,
  FileSpreadsheet,
  ToggleLeft,
  ToggleRight,
  Upload,
  FileText
} from 'lucide-react';
import { 
  Employee, 
  ShiftConfig, 
  ScheduleVersion, 
  WorkerPreference, 
  Availability,
  ShiftType,
  HistoricalContext
} from './types';
import { generateSchedule, exportToCSV, exportToExcel, getDaysInMonth, formatDateKey, parsePastScheduleCSV } from './services/scheduler';

// --- Sub-Components defined here to keep file count manageable while maintaining clarity ---

// 1. Employee Manager
const EmployeeManager: React.FC<{
  employees: Employee[];
  onAdd: (e: Employee) => void;
  onRemove: (id: string) => void;
  onUpdate: (e: Employee) => void;
}> = ({ employees, onAdd, onRemove, onUpdate }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPref, setNewPref] = useState<WorkerPreference>(WorkerPreference.EITHER);
  const [newDaysOff, setNewDaysOff] = useState<number[]>([]);

  const handleAdd = () => {
    if (!newName.trim()) return;
    const newEmployee: Employee = {
      id: crypto.randomUUID(),
      name: newName,
      preference: newPref,
      availability: { daysOff: newDaysOff },
      color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 80%)`
    };
    onAdd(newEmployee);
    setNewName('');
    setNewDaysOff([]);
    setIsAdding(false);
  };

  const toggleDayOff = (dayIndex: number) => {
    setNewDaysOff(prev => 
      prev.includes(dayIndex) 
        ? prev.filter(d => d !== dayIndex) 
        : [...prev, dayIndex]
    );
  };

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" /> Workforce
        </h2>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Worker
        </button>
      </div>

      {isAdding && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100 animate-in fade-in slide-in-from-top-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input 
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preference</label>
              <select 
                value={newPref}
                onChange={(e) => setNewPref(e.target.value as WorkerPreference)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
              >
                {Object.values(WorkerPreference).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-4">
             <label className="block text-sm font-medium text-gray-700 mb-2">Unavailable Days (Days Off)</label>
             <div className="flex gap-2 flex-wrap">
                {days.map((day, idx) => (
                  <button
                    key={day}
                    onClick={() => toggleDayOff(idx)}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition ${
                      newDaysOff.includes(idx) 
                        ? 'bg-red-100 text-red-700 border-red-200' 
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {day}
                  </button>
                ))}
             </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsAdding(false)} className="text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
            <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">Save Worker</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {employees.map(emp => (
          <div key={emp.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-200 transition">
            <div>
              <div className="font-semibold text-gray-900">{emp.name}</div>
              <div className="text-xs text-gray-500 mt-1 flex gap-2">
                <span className={`px-2 py-0.5 rounded-full ${
                  emp.preference === WorkerPreference.DAY_ONLY ? 'bg-amber-100 text-amber-700' :
                  emp.preference === WorkerPreference.NIGHT_ONLY ? 'bg-indigo-100 text-indigo-700' :
                  'bg-gray-200 text-gray-700'
                }`}>{emp.preference}</span>
                
                {emp.availability.daysOff.length > 0 && (
                   <span className="text-red-500">
                     Off: {emp.availability.daysOff.map(d => days[d]).join(', ')}
                   </span>
                )}
              </div>
            </div>
            <button onClick={() => onRemove(emp.id)} className="text-gray-400 hover:text-red-500 transition">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {employees.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-400 italic">
            No workers added yet.
          </div>
        )}
      </div>
    </div>
  );
};

// 2. Configuration Panel
const ConfigPanel: React.FC<{
  config: ShiftConfig;
  onUpdate: (c: ShiftConfig) => void;
}> = ({ config, onUpdate }) => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const updateReq = (dayIdx: number, shift: 'day' | 'night', val: number) => {
    const newReqs = { ...config.requirements };
    if (!newReqs[dayIdx]) newReqs[dayIdx] = { day: 1, night: 1 };
    newReqs[dayIdx] = { ...newReqs[dayIdx], [shift]: val };
    onUpdate({ ...config, requirements: newReqs });
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Settings className="w-5 h-5 text-blue-600" /> Shift Rules
      </h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
           <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Requirements per Day</h3>
           <div className="space-y-3">
             {days.map((day, idx) => {
               const req = config.requirements[idx] || { day: 1, night: 1 };
               return (
                 <div key={day} className="flex items-center justify-between text-sm">
                    <span className="w-24 font-medium text-gray-700">{day}</span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-600 text-xs font-bold">DAY</span>
                        <input 
                          type="number" 
                          min="0" 
                          max="10" 
                          value={req.day} 
                          onChange={(e) => updateReq(idx, 'day', parseInt(e.target.value))}
                          className="w-12 p-1 border rounded text-center bg-white text-gray-900"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-600 text-xs font-bold">NIGHT</span>
                         <input 
                          type="number" 
                          min="0" 
                          max="10" 
                          value={req.night}
                          onChange={(e) => updateReq(idx, 'night', parseInt(e.target.value))}
                          className="w-12 p-1 border rounded text-center bg-white text-gray-900"
                        />
                      </div>
                    </div>
                 </div>
               );
             })}
           </div>
        </div>

        <div className="space-y-6">
           <div>
             <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Timing</h3>
             <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="text-xs font-bold text-amber-600 block mb-1">Day Start</label>
                   <input type="time" value={config.dayStartTime} onChange={(e) => onUpdate({...config, dayStartTime: e.target.value})} className="w-full p-2 border rounded bg-white text-gray-900" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-amber-600 block mb-1">Day End</label>
                   <input type="time" value={config.dayEndTime} onChange={(e) => onUpdate({...config, dayEndTime: e.target.value})} className="w-full p-2 border rounded bg-white text-gray-900" />
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="text-xs font-bold text-indigo-600 block mb-1">Night Start</label>
                   <input type="time" value={config.nightStartTime} onChange={(e) => onUpdate({...config, nightStartTime: e.target.value})} className="w-full p-2 border rounded bg-white text-gray-900" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-indigo-600 block mb-1">Night End</label>
                   <input type="time" value={config.nightEndTime} onChange={(e) => onUpdate({...config, nightEndTime: e.target.value})} className="w-full p-2 border rounded bg-white text-gray-900" />
                 </div>
               </div>
             </div>
           </div>

           <div>
             <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Advanced Distribution</h3>
             <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <div className="flex items-start gap-3">
                   <button 
                      onClick={() => onUpdate({...config, distributeDayShiftsToEither: !config.distributeDayShiftsToEither})}
                      className={`mt-0.5 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${config.distributeDayShiftsToEither ? 'bg-blue-600' : 'bg-gray-200'}`}
                   >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.distributeDayShiftsToEither ? 'translate-x-6' : 'translate-x-1'}`}
                      />
                   </button>
                   <div>
                      <span className="block text-sm font-medium text-gray-900">Prioritize "Either" for Day Shifts</span>
                      <span className="block text-xs text-gray-600 mt-1">
                         If enabled, workers who choose "Either" will be given more morning shifts, potentially reducing the load on "Day Only" workers.
                      </span>
                   </div>
                </div>
             </div>
           </div>

           <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
              <h4 className="text-sm font-bold text-yellow-800 flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4" /> Constraints Active
              </h4>
              <ul className="list-disc list-inside text-xs text-yellow-800 space-y-1">
                <li>No Day shift immediately after Night shift.</li>
                <li>Max 5 consecutive working days per person.</li>
                <li>Attempts to balance total shifts evenly.</li>
              </ul>
           </div>
        </div>
      </div>
    </div>
  );
};

// 3. Schedule Viewer & Stats
const ScheduleViewer: React.FC<{
  version: ScheduleVersion;
  employees: Employee[];
  config: ShiftConfig;
}> = ({ version, employees, config }) => {
  const [view, setView] = useState<'calendar' | 'stats'>('calendar');

  const daysInMonth = getDaysInMonth(version.year, version.month);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Helper to find employee name
  const getEmp = (id: string) => employees.find(e => e.id === id);

  return (
    <div className="space-y-6">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{version.name}</h2>
            <p className="text-sm text-gray-500">Generated: {new Date(version.timestamp).toLocaleString()}</p>
          </div>
          <div className="flex gap-2">
             <div className="flex bg-gray-100 rounded-lg p-1">
                <button 
                  onClick={() => setView('calendar')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${view === 'calendar' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Calendar
                </button>
                <button 
                  onClick={() => setView('stats')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${view === 'stats' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Stats
                </button>
             </div>
             <button 
              onClick={() => exportToCSV(version, employees)}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
             >
               <Download className="w-4 h-4" /> CSV
             </button>
             <button 
              onClick={() => exportToExcel(version, employees)}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm font-medium"
             >
               <FileSpreadsheet className="w-4 h-4" /> Excel
             </button>
          </div>
       </div>

       {view === 'calendar' ? (
         <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200 text-center py-2">
               {weekDays.map(d => <div key={d} className="text-xs font-bold text-gray-500 uppercase">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 auto-rows-fr bg-gray-200 gap-px">
               {/* Empty cells for start of month */}
               {Array.from({ length: daysInMonth[0].getDay() }).map((_, i) => (
                 <div key={`empty-${i}`} className="bg-gray-50 min-h-[120px]" />
               ))}
               
               {daysInMonth.map(day => {
                 const dateKey = formatDateKey(day);
                 const schedule = version.schedule.find(s => s.date === dateKey);
                 const dayShift = schedule?.dayShift || [];
                 const nightShift = schedule?.nightShift || [];

                 return (
                   <div key={dateKey} className="bg-white min-h-[120px] p-2 flex flex-col gap-1">
                      <div className="text-right text-sm font-bold text-gray-400 mb-1">{day.getDate()}</div>
                      
                      {/* Day Shift */}
                      <div className="bg-amber-50 rounded p-1 border border-amber-100">
                         <div className="text-[10px] font-bold text-amber-600 uppercase mb-1">Day ({config.dayStartTime})</div>
                         <div className="space-y-1">
                           {dayShift.map(id => {
                              const e = getEmp(id);
                              return (
                                <div key={id} className="text-xs px-1.5 py-0.5 bg-white rounded shadow-sm text-gray-700 truncate">
                                   {e?.name || 'Unknown'}
                                </div>
                              )
                           })}
                           {dayShift.length === 0 && <div className="text-[10px] text-amber-400 italic">None</div>}
                         </div>
                      </div>

                      {/* Night Shift */}
                      <div className="bg-indigo-50 rounded p-1 border border-indigo-100 mt-auto">
                         <div className="text-[10px] font-bold text-indigo-600 uppercase mb-1">Night ({config.nightStartTime})</div>
                         <div className="space-y-1">
                           {nightShift.map(id => {
                              const e = getEmp(id);
                              return (
                                <div key={id} className="text-xs px-1.5 py-0.5 bg-white rounded shadow-sm text-gray-700 truncate text-white" style={{backgroundColor: '#4338ca', color: 'white'}}>
                                   {e?.name || 'Unknown'}
                                </div>
                              )
                           })}
                           {nightShift.length === 0 && <div className="text-[10px] text-indigo-400 italic">None</div>}
                         </div>
                      </div>
                   </div>
                 );
               })}
            </div>
         </div>
       ) : (
         <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-6">
            <h3 className="font-bold text-gray-800 mb-4">Distribution Analysis (This Month)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                 <thead className="bg-gray-50 text-gray-500 font-medium">
                    <tr>
                      <th className="px-4 py-3 rounded-tl-lg">Employee</th>
                      <th className="px-4 py-3">Preference</th>
                      <th className="px-4 py-3 text-center text-amber-600">Day Shifts</th>
                      <th className="px-4 py-3 text-center text-indigo-600">Night Shifts</th>
                      <th className="px-4 py-3 text-center font-bold text-gray-700">Total</th>
                      <th className="px-4 py-3 text-center text-gray-500 rounded-tr-lg">Max Streak</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                    {employees.map(emp => {
                       const stats = version.stats[emp.id] || { dayShifts: 0, nightShifts: 0, totalShifts: 0, longestStreak: 0 };
                       return (
                         <tr key={emp.id} className="hover:bg-gray-50">
                           <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                           <td className="px-4 py-3 text-gray-500 text-xs">{emp.preference}</td>
                           <td className="px-4 py-3 text-center font-medium text-gray-900">{stats.dayShifts}</td>
                           <td className="px-4 py-3 text-center font-medium text-gray-900">{stats.nightShifts}</td>
                           <td className="px-4 py-3 text-center font-bold bg-gray-50 text-gray-900">{stats.totalShifts}</td>
                           <td className="px-4 py-3 text-center text-gray-900">
                             <span className={`px-2 py-1 rounded-full text-xs font-bold ${stats.longestStreak > 4 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                               {stats.longestStreak}
                             </span>
                           </td>
                         </tr>
                       )
                    })}
                 </tbody>
              </table>
            </div>
         </div>
       )}
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [tab, setTab] = useState<'workers' | 'rules' | 'schedule'>('workers');
  
  // Initial Data
  const [employees, setEmployees] = useState<Employee[]>([
    { id: '1', name: 'גולן חדד', preference: WorkerPreference.DAY_ONLY, availability: { daysOff: [] }, color: '#fff' },
    { id: '2', name: 'ניצן כפיר', preference: WorkerPreference.EITHER, availability: { daysOff: [] }, color: '#fff' },
    { id: '3', name: 'דן אהרוני', preference: WorkerPreference.EITHER, availability: { daysOff: [] }, color: '#fff' },
    { id: '4', name: 'ענבר כפיר', preference: WorkerPreference.EITHER, availability: { daysOff: [] }, color: '#fff' },
    { id: '5', name: 'רועי נוף', preference: WorkerPreference.EITHER, availability: { daysOff: [] }, color: '#fff' },
    { id: '6', name: 'עומרי חכים', preference: WorkerPreference.EITHER, availability: { daysOff: [] }, color: '#fff' },
  ]);

  const [config, setConfig] = useState<ShiftConfig>({
    dayStartTime: '06:00',
    dayEndTime: '15:00',
    nightStartTime: '14:00',
    nightEndTime: '00:00',
    distributeDayShiftsToEither: false, // Default to off
    requirements: {
      0: { day: 1, night: 1 }, // Sun
      1: { day: 2, night: 1 }, // Mon
      2: { day: 2, night: 1 },
      3: { day: 2, night: 1 },
      4: { day: 2, night: 2 }, // Thu
      5: { day: 2, night: 2 }, // Fri
      6: { day: 1, night: 1 }, // Sat
    }
  });

  const [versions, setVersions] = useState<ScheduleVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  
  // Generator State
  const [genMonth, setGenMonth] = useState<number>(new Date().getMonth());
  const [genYear, setGenYear] = useState<number>(new Date().getFullYear());
  const [importedHistory, setImportedHistory] = useState<HistoricalContext | null>(null);

  const currentVersion = useMemo(() => 
    versions.find(v => v.id === selectedVersionId) || versions[0] || null
  , [versions, selectedVersionId]);

  const handleGenerate = () => {
    if (employees.length === 0) {
      alert("Please add employees first.");
      setTab('workers');
      return;
    }
    try {
      const newVersion = generateSchedule(employees, genYear, genMonth, config, importedHistory || undefined);
      setVersions(prev => [newVersion, ...prev]);
      setSelectedVersionId(newVersion.id);
      setTab('schedule');
    } catch (e) {
      alert("Failed to generate schedule. Check constraints or console.");
      console.error(e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const history = await parsePastScheduleCSV(file, employees);
      setImportedHistory(history);
      // Auto-increment month/year suggestion based on uploaded file? 
      // Simplified: Just let user pick month.
    } catch (err) {
      alert("Failed to parse CSV. Ensure it matches the export format.");
      console.error(err);
    }
  };

  const deleteVersion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVersions(prev => prev.filter(v => v.id !== id));
    if (selectedVersionId === id) setSelectedVersionId(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-20 shadow-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold tracking-tight">ShiftMaster</h1>
          </div>
          <nav className="flex gap-1 bg-slate-800 p-1 rounded-lg">
             <button onClick={() => setTab('workers')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'workers' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>Workers</button>
             <button onClick={() => setTab('rules')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'rules' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>Rules</button>
             <button onClick={() => setTab('schedule')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'schedule' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>Schedule</button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        {tab === 'workers' && (
          <div className="max-w-4xl mx-auto">
             <div className="mb-6">
               <h2 className="text-2xl font-bold text-slate-800 mb-2">Worker Management</h2>
               <p className="text-slate-500">Add your team members, define their shift preferences and days off.</p>
             </div>
             <EmployeeManager 
               employees={employees} 
               onAdd={e => setEmployees([...employees, e])}
               onRemove={id => setEmployees(prev => prev.filter(e => e.id !== id))}
               onUpdate={() => {}} 
             />
          </div>
        )}

        {tab === 'rules' && (
          <div className="max-w-4xl mx-auto">
             <div className="mb-6">
               <h2 className="text-2xl font-bold text-slate-800 mb-2">Configuration</h2>
               <p className="text-slate-500">Set shift times and how many workers are needed for each day/shift.</p>
             </div>
             <ConfigPanel config={config} onUpdate={setConfig} />
          </div>
        )}

        {tab === 'schedule' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
             {/* Sidebar: Generator & History */}
             <div className="lg:col-span-3 space-y-6">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                   <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                     <CheckCircle className="w-4 h-4 text-blue-600" /> New Schedule
                   </h3>
                   <div className="space-y-3 mb-4">
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Month</label>
                        <select 
                          value={genMonth} 
                          onChange={(e) => setGenMonth(parseInt(e.target.value))}
                          className="w-full p-2 border rounded-md bg-gray-50 text-sm text-gray-900"
                        >
                          {Array.from({length: 12}).map((_, i) => (
                            <option key={i} value={i}>{new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Year</label>
                         <input 
                           type="number" 
                           value={genYear} 
                           onChange={(e) => setGenYear(parseInt(e.target.value))}
                           className="w-full p-2 border rounded-md bg-gray-50 text-sm text-gray-900"
                        />
                      </div>
                   </div>

                   <div className="border-t pt-4 mb-4">
                      <label className="flex flex-col gap-2 cursor-pointer">
                         <span className="text-xs font-bold text-gray-500 uppercase flex items-center justify-between">
                           Previous Month CSV
                           {importedHistory && <span className="text-green-600 text-[10px] bg-green-100 px-1 rounded">Active</span>}
                         </span>
                         <div className="flex items-center gap-2 p-2 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition">
                           <Upload className="w-4 h-4 text-gray-400" />
                           <span className="text-xs text-gray-600 truncate flex-1">
                             {importedHistory ? importedHistory.sourceName : "Upload History..."}
                           </span>
                           <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                         </div>
                      </label>
                      {importedHistory && (
                        <div className="mt-2 text-[10px] text-gray-500">
                          * Will carry over constraints (No Day After Night) and fairness stats.
                          <button onClick={() => setImportedHistory(null)} className="text-red-500 ml-2 hover:underline">Clear</button>
                        </div>
                      )}
                   </div>

                   <button 
                     onClick={handleGenerate}
                     className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition shadow-sm hover:shadow-md flex justify-center items-center gap-2"
                   >
                     Generate
                   </button>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                   <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                     <History className="w-4 h-4 text-gray-500" /> History
                   </h3>
                   <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {versions.map(v => (
                        <div 
                          key={v.id} 
                          onClick={() => setSelectedVersionId(v.id)}
                          className={`p-3 rounded-lg cursor-pointer border transition relative group ${selectedVersionId === v.id ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200' : 'bg-gray-50 border-transparent hover:bg-gray-100'}`}
                        >
                           <div className="text-sm font-medium text-gray-900">{v.name}</div>
                           <div className="text-xs text-gray-500 mt-1">
                             {new Date(v.year, v.month).toLocaleString('default', { month: 'short', year: 'numeric' })}
                           </div>
                           <button 
                             onClick={(e) => deleteVersion(v.id, e)}
                             className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                           >
                             <Trash2 className="w-3 h-3" />
                           </button>
                        </div>
                      ))}
                      {versions.length === 0 && (
                        <div className="text-center py-6 text-xs text-gray-400">
                          No schedules generated yet.
                        </div>
                      )}
                   </div>
                </div>
             </div>

             {/* Main Viewer */}
             <div className="lg:col-span-9">
                {currentVersion ? (
                  <ScheduleViewer version={currentVersion} employees={employees} config={config} />
                ) : (
                  <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
                     <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                       <Calendar className="w-8 h-8 text-blue-300" />
                     </div>
                     <h3 className="text-lg font-medium text-gray-900">Ready to Schedule</h3>
                     <p className="text-gray-500 max-w-sm mt-2">
                       Configure your employees and rules, then click "Generate" to create your first optimized shift schedule.
                     </p>
                  </div>
                )}
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;