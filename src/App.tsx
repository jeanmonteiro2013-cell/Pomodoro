/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Coffee, 
  Brain, 
  Settings2, 
  X,
  Volume2,
  VolumeX,
  CheckCircle2,
  History,
  Trash2,
  ListTodo,
  Plus,
  Circle,
  Square,
  Calculator,
  Delete,
  Divide,
  Minus,
  Equal,
  X as XIcon,
  Download,
  FileText,
  Calendar,
  Percent,
  PlusCircle,
  Gavel,
  ChevronLeft,
  ChevronRight,
  Scale,
  Clock,
  Battery,
  Sun,
  Moon
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper for Tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type SessionType = 'focus' | 'short' | 'long';

interface HistoryEntry {
  id: string;
  type: SessionType;
  duration: number;
  timestamp: number;
  taskId?: string; // Optional task association
}

interface CalcHistoryEntry {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  priority?: 'high' | 'medium' | 'low';
  dueDate?: string; // 'YYYY-MM-DD'
}

interface LegalDebit {
  id: string;
  description: string;
  value: number;
  date: string;
  correctedValue?: number;
  interestValue?: number;
  totalValue?: number;
}

interface Settings {
  focus: number;
  short: number;
  long: number;
  notificationsEnabled: boolean;
  theme: 'light' | 'dark';
}

const DEFAULT_SETTINGS: Settings = {
  focus: 60,
  short: 10,
  long: 20,
  notificationsEnabled: true,
  theme: 'light',
};

// --- Holiday & Deadline Helpers ---

const HOLIDAYS_2026 = [
  '2026-01-01', // Confraternização Universal
  '2026-01-25', // Aniversário de São Paulo (Cidade)
  '2026-02-16', // Carnaval
  '2026-02-17', // Carnaval
  '2026-04-03', // Sexta-feira Santa
  '2026-04-21', // Tiradentes
  '2026-05-01', // Dia do Trabalho
  '2026-06-04', // Corpus Christi
  '2026-07-09', // Revolução Constitucionalista (Estado)
  '2026-09-07', // Independência
  '2026-10-12', // Padroeira do Brasil
  '2026-11-02', // Finados
  '2026-11-15', // Proclamação da República
  '2026-11-20', // Dia da Consciência Negra
  '2026-12-25', // Natal
];

function isBusinessDay(date: Date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  
  const dateStr = date.toISOString().split('T')[0];
  if (HOLIDAYS_2026.includes(dateStr)) return false;
  
  // Recesso Forense (Dec 20 - Jan 20)
  const month = date.getMonth();
  const dayOfMonth = date.getDate();
  if (
    (month === 11 && dayOfMonth >= 20) || 
    (month === 0 && dayOfMonth <= 20)
  ) {
    return false;
  }
  
  return true;
}

function calculateDeadline(startDate: Date, duration: number) {
  let count = 0;
  let current = new Date(startDate);
  
  // Deadlines start counting the next business day
  current.setDate(current.getDate() + 1);
  
  while (count < duration) {
    if (isBusinessDay(current)) {
      count++;
    }
    if (count < duration) {
      current.setDate(current.getDate() + 1);
    }
  }
  return current;
}

function generateId() {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default function App() {
  // --- State ---
  const [sessionType, setSessionType] = useState<SessionType>('focus');
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem('zen_pomo_settings');
      if (!saved) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(saved);
      // Force 60 if it's the old 25 default
      if (parsed.focus === 25) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (e) {
      console.error("Error loading settings:", e);
      return DEFAULT_SETTINGS;
    }
  });
  
  const [timeLeft, setTimeLeft] = useState(() => (settings?.focus || 60) * 60);
  const [isActive, setIsActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showDeadlines, setShowDeadlines] = useState(false);
  
  // Navigation
  const [currentView, setCurrentView] = useState<'timer' | 'calendar' | 'calc' | 'deadlines'>('timer');

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('zen_pomo_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const saved = localStorage.getItem('zen_pomo_tasks');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [calcHistory, setCalcHistory] = useState<CalcHistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('zen_pomo_calc_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Calendar State
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day' | 'list'>('month');
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Deadline Counter State
  const [deadlineStart, setDeadlineStart] = useState(new Date().toISOString().split('T')[0]);
  const [deadlineDuration, setDeadlineDuration] = useState('15');
  const [deadlineResult, setDeadlineResult] = useState<Date | null>(null);

  const requestNotificationPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }, []);

  const sendNotification = useCallback((title: string, body: string) => {
    if (!settings.notificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
    
    try {
      new Notification(title, {
        body,
        icon: "/favicon.ico", // Attempt to use favicon if it exists
      });
    } catch (err) {
      console.error("Failed to send notification:", err);
    }
  }, [settings.notificationsEnabled]);

  // --- Handlers ---

  const handleCalculateDeadline = () => {
    const res = calculateDeadline(new Date(deadlineStart), Number(deadlineDuration));
    setDeadlineResult(res);
  };

  const getCalendarDays = () => {
    const start = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    const end = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0);
    
    // Padding for starting day
    const days = [];
    const startDay = start.getDay();
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    
    for (let i = 1; i <= end.getDate(); i++) {
      days.push(new Date(calendarDate.getFullYear(), calendarDate.getMonth(), i));
    }
    return days;
  };

  // Calculator State
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcExpression, setCalcExpression] = useState('');
  const [calcMode, setCalcMode] = useState<'simple' | 'legal'>('simple');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('low');
  const [taskDueDate, setTaskDueDate] = useState('');

  // Legal Calculator State
  const [legalDebits, setLegalDebits] = useState<LegalDebit[]>([]);
  const [useRealRates, setUseRealRates] = useState(true);
  const [legalInterestRate, setLegalInterestRate] = useState('1'); 
  const [legalCorrectionIndex, setLegalCorrectionIndex] = useState('0');
  const [isFetchingRates, setIsFetchingRates] = useState(false);
  const [legalDescription, setLegalDescription] = useState('');
  const [legalValue, setLegalValue] = useState('');
  const [legalDate, setLegalDate] = useState(new Date().toISOString().split('T')[0]);

  // Refs for timer management
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Logic ---

  // Legal Calculator Logic
  const fetchLegalRates = async (date: string) => {
    setIsFetchingRates(true);
    try {
      const d = new Date(date);
      const start = `01/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
      const today = new Date();
      const end = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
      
      const response = await fetch(`/api/indices?dataInicial=${start}&dataFinal=${end}`);
      const data = await response.json();
      
      // Calculate accumulated IPCA and average SELIC
      // This is a simplified version for the quick tool
      const totalIpca = data.ipca.reduce((acc: number, item: any) => acc + (parseFloat(item.valor) / 100), 0);
      const avgSelic = data.selic.reduce((acc: number, item: any) => acc + parseFloat(item.valor), 0) / (data.selic.length || 1);
      
      // Law 14.905/2024 logic: Juros = SELIC - IPCA (min 0)
      const calculatedInterest = Math.max(0, (avgSelic - (totalIpca * 100)) / (data.selic.length || 1));
      
      return {
        correction: totalIpca * 100,
        interest: calculatedInterest
      };
    } catch (error) {
      console.error("Fetch rates error:", error);
      return null;
    } finally {
      setIsFetchingRates(false);
    }
  };

  // Formatting Helpers
  const formatCurrencyValue = (val: string) => {
    // Remove everything except numbers
    const cleanValue = val.replace(/\D/g, "");
    if (!cleanValue) return "";
    
    // Convert to number and format
    const numberValue = (parseInt(cleanValue) / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
    });
    return numberValue;
  };

  const parseCurrencyToNumber = (val: string) => {
    return parseFloat(val.replace(/\./g, "").replace(",", ".")) || 0;
  };

  const addLegalDebit = async () => {
    const numericValue = parseCurrencyToNumber(legalValue);
    if (!numericValue || isNaN(numericValue)) return;
    
    let currentInterest = Number(legalInterestRate);
    let currentCorrection = Number(legalCorrectionIndex);

    if (useRealRates) {
      const rates = await fetchLegalRates(legalDate);
      if (rates) {
        currentCorrection = rates.correction;
        currentInterest = rates.interest;
      }
    }

    const originalValue = numericValue;
    const months = Math.max(0, Math.floor((Date.now() - new Date(legalDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
    const interestTotal = (originalValue * (currentInterest / 100)) * months;
    const correctionTotal = originalValue * (currentCorrection / 100);
    
    const newDebit: LegalDebit = {
      id: generateId(),
      description: legalDescription || `Débito ${legalDebits.length + 1}`,
      value: originalValue,
      date: legalDate,
      interestValue: interestTotal,
      correctedValue: originalValue + correctionTotal,
      totalValue: originalValue + interestTotal + correctionTotal
    };

    setLegalDebits(prev => [...prev, newDebit]);
    setLegalDescription('');
    setLegalValue('');
  };

  const removeLegalDebit = (id: string) => {
    setLegalDebits(prev => prev.filter(d => d.id !== id));
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const total = legalDebits.reduce((acc, d) => acc + (d.totalValue || 0), 0);
    
    doc.setFontSize(18);
    doc.text("Planilha de Débitos Jurídicos", 14, 22);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 14, 30);
    doc.text(`Taxa de Juros: ${legalInterestRate}% /mês | Correção: ${legalCorrectionIndex}%`, 14, 35);

    const tableData = legalDebits.map(d => [
      d.description,
      new Date(d.date).toLocaleDateString('pt-BR'),
      `R$ ${d.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `R$ ${(d.interestValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `R$ ${(d.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Descrição', 'Data', 'Valor Orig.', 'Juros', 'Total']],
      body: tableData,
      foot: [['', '', '', 'TOTAL GERAL', `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]],
      theme: 'grid',
      headStyles: { fillColor: [244, 63, 94] }
    });

    doc.save("calculo_pomodoro_legal.pdf");
  };

  // Simple Calculator Logic
  const handleCalcClick = (val: string) => {
    if (val === 'C') {
      setCalcDisplay('0');
      setCalcExpression('');
    } else if (val === '=') {
      try {
        // Basic evaluation (safe enough for personal calc)
        // Replacing display X with * for eval
        const cleanedExpr = calcExpression.replace(/×/g, '*').replace(/÷/g, '/');
        const res = eval(cleanedExpr);
        const resultString = String(Number.isInteger(res) ? res : res.toFixed(4).replace(/\.?0+$/, ''));
        
        const newEntry: CalcHistoryEntry = {
          id: generateId(),
          expression: calcExpression,
          result: resultString,
          timestamp: Date.now(),
        };
        
        setCalcHistory(prev => [newEntry, ...prev].slice(0, 50));
        setCalcDisplay(resultString);
        setCalcExpression(resultString);
      } catch {
        setCalcDisplay('Erro');
      }
    } else if (val === 'DEL') {
      setCalcExpression(prev => prev.slice(0, -1) || '');
      setCalcDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    } else {
      const isOperator = ['+', '-', '×', '÷'].includes(val);
      setCalcExpression(prev => prev + val);
      if (isOperator) {
        setCalcDisplay(val);
      } else {
        setCalcDisplay(prev => (prev === '0' || ['+', '-', '×', '÷'].includes(prev)) ? val : prev + val);
      }
    }
  };

  const resetTimer = useCallback(() => {
    setIsActive(false);
    setTimeLeft(settings[sessionType] * 60);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [sessionType, settings]);

  const toggleTimer = () => {
    setIsActive(!isActive);
  };

  const playSound = useCallback(() => {
    if (!soundEnabled) return;
    const audioContent = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTv9Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8=";
    const audio = new Audio(audioContent);
    audio.play().catch(e => console.error("Audio play failed:", e));
  }, [soundEnabled]);

  const recordSession = useCallback((type: SessionType) => {
    const newEntry: HistoryEntry = {
      id: generateId(),
      type,
      duration: settings[type],
      timestamp: Date.now(),
      taskId: type === 'focus' ? activeTaskId || undefined : undefined,
    };
    setHistory(prev => [newEntry, ...prev]);
  }, [settings, activeTaskId]);

  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    const newTask: Task = {
      id: generateId(),
      title: newTaskTitle.trim(),
      completed: false,
      createdAt: Date.now(),
      priority: taskPriority,
      dueDate: taskDueDate || undefined
    };
    setTasks(prev => [newTask, ...prev]);
    setNewTaskTitle('');
    setTaskDueDate('');
    setTaskPriority('low');
  };

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (activeTaskId === id) setActiveTaskId(null);
  };

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      playSound();
      
      const sessionLabel = sessionType === 'focus' ? 'Foco' : sessionType === 'short' ? 'Pausa' : 'Descanso';
      sendNotification(`Sessão de ${sessionLabel} finalizada!`, `Parabéns! Você completou sua sessão de ${sessionLabel}.`);
      
      recordSession(sessionType);
      if (sessionType === 'focus') {
        setSessionsCompleted(prev => prev + 1);
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, timeLeft, playSound, sessionType, recordSession]);

  // Sync timeLeft when session type or settings change (if timer is NOT active)
  useEffect(() => {
    if (!isActive) {
      setTimeLeft(settings[sessionType] * 60);
    }
  }, [sessionType, settings, isActive]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem('zen_pomo_settings', JSON.stringify(settings));
    } catch (e) { console.error("Save settings error:", e); }

    // Apply theme
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  // Persist history
  useEffect(() => {
    try {
      localStorage.setItem('zen_pomo_history', JSON.stringify(history));
    } catch (e) { console.error("Save history error:", e); }
  }, [history]);

  // Persist tasks
  useEffect(() => {
    try {
      localStorage.setItem('zen_pomo_tasks', JSON.stringify(tasks));
    } catch (e) { console.error("Save tasks error:", e); }
  }, [tasks]);

  // Persist calc history
  useEffect(() => {
    try {
      localStorage.setItem('zen_pomo_calc_history', JSON.stringify(calcHistory));
    } catch (e) { console.error("Save calc error:", e); }
  }, [calcHistory]);

  // Initial Permission Request & Deadline Check
  useEffect(() => {
    requestNotificationPermission();
    
    // Check for today's deadlines
    const today = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter(t => !t.completed && t.dueDate === today);
    
    if (todayTasks.length > 0) {
      const taskNames = todayTasks.map(t => t.title).join(', ');
      sendNotification(
        "Prazos para hoje!", 
        `Você tem ${todayTasks.length} tarefa(s) vencendo hoje: ${taskNames}`
      );
    }
  }, []);

  // Formatting
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const percentComplete = Math.max(0, Math.min(1, 1 - (timeLeft / ((settings[sessionType] || 60) * 60))));

  // --- Components ---

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden safe-area-inset">
      <header className="fixed top-0 left-0 w-full p-6 flex justify-between items-center z-10">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3"
        >
          <div className="bg-primary p-2 rounded-xl text-white">
            <Scale size={20} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-primary font-display font-extrabold text-2xl leading-none tracking-tight">POMODORO</h1>
            <p className="text-[9px] text-primary/70 uppercase font-bold tracking-[0.3em] mt-0.5">ESTRATÉGICO</p>
          </div>
        </motion.div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowDeadlines(true)}
            className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors"
            title="Contador de Prazos"
          >
            <Scale size={24} />
          </button>
          <button 
            onClick={() => setShowCalendar(true)}
            className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors"
            title="Calendário"
          >
            <Calendar size={24} />
          </button>
          <button 
            onClick={() => setShowCalculator(true)}
            className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors"
            title="Calculadora"
          >
            <Calculator size={24} />
          </button>
          <button 
            onClick={() => setShowTasks(true)}
            className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors relative"
            title="Tarefas"
          >
            <ListTodo size={24} />
            {tasks.filter(t => !t.completed).length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-secondary text-white text-[10px] flex items-center justify-center rounded-full font-bold shadow-sm">
                {tasks.filter(t => !t.completed).length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setShowHistory(true)}
            className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors"
            title="Histórico de Sessões"
          >
            <History size={24} />
          </button>
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors"
            title={soundEnabled ? "Desativar Som" : "Ativar Som"}
          >
            {soundEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors"
            title="Configurações"
          >
            <Settings2 size={24} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 mt-16">
        <div className="w-full max-w-md bg-white/50 backdrop-blur-xl border border-primary/5 rounded-[48px] p-12 shadow-2xl shadow-primary/5">
          {/* Mode Switcher */}
          <div className="flex justify-center gap-1 bg-primary/5 p-1 rounded-2xl mb-12">
            {[
              { id: 'focus', icon: Brain, label: 'Foco' },
              { id: 'short', icon: Coffee, label: 'Pausa' },
              { id: 'long', icon: Battery, label: 'Descanso' }
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setSessionType(m.id as SessionType)}
                className={cn(
                  "flex items-center gap-2 px-6 py-3 rounded-xl transition-all duration-300",
                  sessionType === m.id 
                    ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105" 
                    : "text-primary/60 hover:text-primary"
                )}
              >
                <m.icon size={16} />
                <span className="text-xs font-bold uppercase tracking-widest">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Main Timer Display */}
          <div className="relative aspect-square flex items-center justify-center mb-12">
            {/* Progress Circle Wrapper */}
            <div className="absolute inset-0 transition-transform duration-700 hover:scale-105">
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="50%"
                  cy="50%"
                  r="48%"
                  className="stroke-primary/5 fill-none"
                  strokeWidth="2"
                />
                <motion.circle
                  cx="50%"
                  cy="50%"
                  r="48%"
                  className="stroke-primary fill-none"
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={{ pathLength: 1 }}
                  animate={{ pathLength: (percentComplete || 1) }}
                  transition={{ duration: 1, ease: "linear" }}
                />
              </svg>
            </div>
            
            <div className="flex flex-col items-center">
              <motion.span 
                key={timeLeft}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-8xl font-display font-bold text-primary tabular-nums"
              >
                {formatTime(timeLeft)}
              </motion.span>
              <div className="mt-4 flex flex-col items-center gap-1">
                <p className="text-[10px] text-primary/40 uppercase font-black tracking-[0.3em] overflow-hidden">
                  Sessão Jurídica em Curso
                </p>
                {activeTaskId && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-secondary/10 rounded-full">
                    <div className="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse" />
                    <span className="text-[10px] text-secondary font-black uppercase truncate max-w-[120px]">
                      {tasks.find(t => t.id === activeTaskId)?.title}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={resetTimer}
              className="w-16 h-16 rounded-full border border-primary/10 flex items-center justify-center text-primary hover:bg-primary hover:text-white hover:border-primary transition-all active:scale-95"
            >
              <RotateCcw size={24} />
            </button>
            
            <button
              onClick={() => setIsActive(!isActive)}
              className="w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/30 hover:scale-105 transition-all active:scale-95"
            >
              {isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
            </button>

            <button
              onClick={() => {
                const nextType = sessionType === 'focus' ? 'short' : 'focus';
                setSessionType(nextType);
                setIsActive(false);
                setTimeLeft(settings[nextType] * 60);
              }}
              className="w-16 h-16 rounded-full border border-primary/10 flex items-center justify-center text-primary hover:bg-primary hover:text-white hover:border-primary transition-all active:scale-95"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>
      </main>

      {/* Stats/Inspiration */}
      <motion.footer 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-16 text-center"
      >
        <p className="text-stone-600 text-xs max-w-[280px] leading-relaxed italic">
          "Foque no agora. A paz é encontrada no trabalho feito com intenção."
        </p>
      </motion.footer>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 bg-black/60 z-20"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 w-full bg-[var(--color-background)] border-t border-primary/10 rounded-t-[32px] p-8 z-30 pb-safe max-h-[85vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="font-display font-medium text-2xl text-primary">Configurações</h2>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 bg-primary/5 rounded-full text-primary hover:bg-primary/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-8">
                {(['focus', 'short', 'long'] as SessionType[]).map((type) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center border",
                        type === 'focus' ? 'bg-primary border-primary text-white' : type === 'short' ? 'bg-secondary border-secondary text-white' : 'bg-primary/10 border-primary/20 text-primary'
                      )}>
                        {type === 'focus' ? (
                          <Brain className="w-5 h-5" />
                        ) : (
                          <Coffee className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-primary capitalize text-sm">
                          {type === 'focus' ? 'Foco' : type === 'short' ? 'Pausa Curta' : 'Descanso'}
                        </p>
                        <p className="text-[10px] text-stone-400 uppercase tracking-widest font-black mt-1">Minutos por Sessão</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => {
                          const newVal = Math.max(1, settings[type] - 1);
                          setSettings({ ...settings, [type]: newVal });
                        }}
                        className="w-10 h-10 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-8 text-center font-display font-black text-xl text-primary italic">{settings[type]}</span>
                      <button 
                        onClick={() => {
                          const newVal = Math.min(60, settings[type] + 1);
                          setSettings({ ...settings, [type]: newVal });
                        }}
                        className="w-10 h-10 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-[var(--color-background)]">
                      {settings.theme === 'light' ? <Sun size={20} /> : <Moon size={20} />}
                    </div>
                    <div>
                      <p className="font-bold text-primary text-sm">Tema do App</p>
                      <p className="text-[10px] text-stone-400 uppercase tracking-widest font-black mt-1">{settings.theme === 'light' ? 'Claro' : 'Escuro'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSettings({ ...settings, theme: settings.theme === 'light' ? 'dark' : 'light' })}
                    className={cn(
                      "w-12 h-6 rounded-full p-1 transition-colors duration-300",
                      settings.theme === 'dark' ? "bg-primary" : "bg-stone-200"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 bg-white rounded-full transition-transform duration-300",
                      settings.theme === 'dark' ? "translate-x-6" : "translate-x-0"
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-[var(--color-background)]">
                      <Volume2 size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-primary text-sm">Notificações Push</p>
                      <p className="text-[10px] text-stone-400 uppercase tracking-widest font-black mt-1">Alertas de Sessão e Prazos</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSettings({ ...settings, notificationsEnabled: !settings.notificationsEnabled })}
                    className={cn(
                      "w-12 h-6 rounded-full p-1 transition-colors duration-300",
                      settings.notificationsEnabled ? "bg-primary" : "bg-stone-200"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 bg-white rounded-full transition-transform duration-300",
                      settings.notificationsEnabled ? "translate-x-6" : "translate-x-0"
                    )} />
                  </button>
                </div>

                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full py-4 bg-primary text-white rounded-xl font-black uppercase tracking-widest mt-4 shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform"
                >
                  SALVAR CONFIGURAÇÕES
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTasks && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTasks(false)}
              className="fixed inset-0 bg-black/60 z-20"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 w-full bg-[var(--color-background)] border-t border-primary/10 rounded-t-[32px] p-8 z-30 pb-safe max-h-[85vh] flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="font-display font-medium text-2xl text-primary">Diretório de Tarefas</h2>
                  <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-1">Gestão de Workflow</p>
                </div>
                <button 
                  onClick={() => setShowTasks(false)}
                  className="p-2 bg-primary/5 rounded-full text-primary hover:bg-primary/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="bg-white border border-primary/10 rounded-2xl p-6 mb-8 shadow-sm">
                <div className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    <input 
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addTask()}
                      placeholder="Identificar nova demanda..."
                      className="flex-1 bg-transparent border-b border-primary/10 text-primary py-2 focus:border-primary outline-none transition-colors font-medium placeholder:text-stone-300"
                    />
                    <button 
                      onClick={addTask}
                      className="p-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
                    >
                      <Plus size={24} />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-stone-500 uppercase font-black tracking-widest">Prazo Fatal</label>
                      <input 
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="bg-primary/5 border border-primary/5 rounded-lg px-3 py-2 text-primary text-xs outline-none focus:border-primary/50 font-bold"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-stone-500 uppercase font-black tracking-widest">Gravidade</label>
                      <select 
                        value={taskPriority}
                        onChange={(e) => setTaskPriority(e.target.value as any)}
                        className="bg-primary/5 border border-primary/5 rounded-lg px-3 py-2 text-primary text-xs outline-none focus:border-primary/50 font-bold"
                      >
                        <option value="low">Baixa</option>
                        <option value="medium">Média</option>
                        <option value="high">Alta</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Task List */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-stone-300/50">
                    <ListTodo size={48} strokeWidth={1} />
                    <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Sem pendências registradas</p>
                  </div>
                ) : (
                  tasks.map((task) => (
                    <motion.div 
                      key={task.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "p-4 rounded-xl flex items-center justify-between border transition-all duration-300 shadow-sm",
                        activeTaskId === task.id ? "bg-primary/5 border-primary/20" : "bg-card border-primary/5"
                      )}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <button 
                          onClick={() => toggleTask(task.id)}
                          className={cn(
                            "w-6 h-6 rounded-lg border flex items-center justify-center transition-all focus:outline-none",
                            task.completed ? "bg-primary border-primary text-background" : "bg-card border-primary/10 text-stone-300"
                          )}
                        >
                          {task.completed && <CheckCircle2 size={14} />}
                        </button>
                        <div 
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => !task.completed && setActiveTaskId(task.id === activeTaskId ? null : task.id)}
                        >
                          <p className={cn(
                            "text-sm font-bold truncate",
                            task.completed ? "text-stone-300 line-through font-normal" : "text-primary"
                          )}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {task.dueDate && (
                              <span className="text-[9px] text-stone-400 font-black uppercase tracking-tight flex items-center gap-1">
                                <Calendar size={8} /> {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                              </span>
                            )}
                            <span className={cn(
                              "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                              task.priority === 'high' ? "bg-rose-50 text-rose-600" :
                              task.priority === 'medium' ? "bg-amber-50 text-amber-600" :
                              "bg-primary/10 text-primary/60"
                            )}>
                              {task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Média' : 'Baixa'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {!task.completed && (
                          <button 
                            onClick={() => setActiveTaskId(task.id === activeTaskId ? null : task.id)}
                            className={cn(
                              "text-[10px] font-black px-3 py-1.5 rounded-xl transition-all uppercase tracking-widest",
                              activeTaskId === task.id ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-primary/60 hover:text-primary hover:bg-primary/5"
                            )}
                          >
                            {activeTaskId === task.id ? 'EM FOCO' : 'FOCAR'}
                          </button>
                        )}
                        <button 
                          onClick={() => deleteTask(task.id)}
                          className="p-2 text-stone-300 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCalendar && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCalendar(false)}
              className="fixed inset-0 bg-black/60 z-20"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 w-full bg-[var(--color-background)] border-t border-primary/10 rounded-t-[32px] p-8 z-30 pb-safe max-h-[95vh] flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-4 items-end">
                  <div>
                    <h2 className="font-display font-medium text-2xl text-primary">Calendário</h2>
                    <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-1">Planejamento Jurídico</p>
                  </div>
                  <div className="bg-primary/5 p-1 rounded-lg flex gap-1 mb-1">
                    {['month', 'week', 'day', 'list'].map((v) => (
                      <button 
                        key={v}
                        onClick={() => setCalendarView(v as any)}
                        className={cn(
                          "px-3 py-1 rounded text-[10px] font-bold uppercase transition-all",
                          calendarView === v ? "bg-primary text-white" : "text-stone-500 hover:text-primary"
                        )}
                      >
                        {v === 'month' ? 'Mês' : v === 'week' ? 'Semana' : v === 'day' ? 'Dia' : 'Lista'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-primary/5 p-1 rounded-lg border border-primary/5">
                    <button 
                      onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                      className="p-1.5 hover:bg-primary/10 rounded text-primary"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs font-bold text-primary px-2 min-w-[120px] text-center">
                      {calendarDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}
                    </span>
                    <button 
                      onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                      className="p-1.5 hover:bg-primary/10 rounded text-primary"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <button 
                    onClick={() => setShowCalendar(false)}
                    className="p-2 bg-primary/5 rounded-full text-primary hover:bg-primary/10 transition-colors"
                  >
                    <XIcon size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col">
                {calendarView === 'month' && (
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-7 gap-px bg-primary/10 border border-primary/10 rounded-2xl overflow-hidden shadow-sm">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                        <div key={d} className="bg-primary/5 p-2 text-center text-[10px] font-black text-primary/60 uppercase tracking-widest">
                          {d}
                        </div>
                      ))}
                      {getCalendarDays().map((day, idx) => {
                        const dateStr = day?.toISOString().split('T')[0];
                        const isHoliday = dateStr && HOLIDAYS_2026.includes(dateStr);
                        const dayTasks = tasks.filter(t => t.dueDate === dateStr);
                        const isToday = dateStr === new Date().toISOString().split('T')[0];

                        return (
                          <div 
                            key={idx} 
                            className={cn(
                              "min-h-[100px] bg-white p-2 flex flex-col gap-1 transition-colors hover:bg-primary/[0.02]",
                              !day && "opacity-0 pointer-events-none"
                            )}
                          >
                            <div className="flex justify-between items-center">
                              <span className={cn(
                                "text-xs font-bold",
                                isToday ? "text-white bg-primary px-1.5 rounded" : "text-stone-400",
                                isHoliday && "text-secondary underline decoration-dotted"
                              )}>
                                {day?.getDate()}
                              </span>
                              {isHoliday && (
                                <span className="text-[8px] text-secondary font-black uppercase truncate px-1">Feriado</span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                              {dayTasks.map(t => (
                                <div 
                                  key={t.id} 
                                  className={cn(
                                    "text-[9px] p-1 rounded border leading-tight truncate font-bold",
                                    t.priority === 'high' ? "bg-rose-50 border-rose-100 text-rose-500" :
                                    t.priority === 'medium' ? "bg-amber-50 border-amber-100 text-amber-500" :
                                    "bg-primary/5 border-primary/10 text-primary"
                                  )}
                                >
                                  {t.completed && "✓ "}
                                  {t.title}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {calendarView === 'list' && (
                  <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar">
                    {tasks.filter(t => t.dueDate).sort((a,b) => a.dueDate!.localeCompare(b.dueDate!)).length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-40 text-stone-800">
                        <ListTodo size={32} strokeWidth={1} />
                        <span className="text-[10px] uppercase tracking-widest mt-2">Sem tarefas agendadas</span>
                      </div>
                    ) : (
                      tasks.filter(t => t.dueDate).map(t => (
                        <div key={t.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-primary/5 shadow-sm">
                          <div className={cn(
                            "w-1 h-8 rounded-full",
                            t.priority === 'high' ? "bg-rose-500" : t.priority === 'medium' ? "bg-amber-500" : "bg-primary"
                          )} />
                          <div className="flex-1">
                            <h4 className="text-primary font-bold text-sm">{t.title}</h4>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] text-stone-400 flex items-center gap-1 font-bold">
                                <Calendar size={10} /> {new Date(t.dueDate!).toLocaleDateString('pt-BR')}
                              </span>
                              {t.completed && (
                                <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-tighter">Concluída</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {(calendarView === 'week' || calendarView === 'day') && (
                  <div className="flex-1 flex items-center justify-center text-stone-800 flex-col">
                    <Clock size={48} strokeWidth={1} />
                    <p className="text-[10px] uppercase tracking-widest mt-4">Visualização em desenvolvimento</p>
                    <button 
                      onClick={() => setCalendarView('month')}
                      className="mt-4 text-xs text-rose-400 font-bold hover:underline"
                    >
                      VOLTAR PARA O MÊS
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeadlines && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeadlines(false)}
              className="fixed inset-0 bg-black/60 z-20"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 w-full bg-[var(--color-background)] border-t border-primary/10 rounded-t-[32px] p-8 z-30 pb-safe max-h-[90vh] flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="font-display font-medium text-2xl text-primary">Contador de Prazos</h2>
                  <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-1">Legislação CPC/2015</p>
                </div>
                <button 
                  onClick={() => setShowDeadlines(false)}
                  className="p-2 bg-primary/5 rounded-full text-primary hover:bg-primary/10 transition-colors"
                >
                  <XIcon size={20} />
                </button>
              </div>

              <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                <div className="bg-white/50 border border-primary/10 rounded-2xl p-6 space-y-6 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] text-stone-500 uppercase font-black tracking-widest">Início do Prazo</label>
                      <input 
                        type="date"
                        value={deadlineStart}
                        onChange={(e) => setDeadlineStart(e.target.value)}
                        className="w-full bg-white border border-primary/10 rounded-xl px-4 py-3 text-primary outline-none focus:border-primary/50"
                      />
                      <p className="text-[8px] text-stone-400 font-bold uppercase">A contagem inicia no 1º dia útil seguinte</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] text-stone-500 uppercase font-black tracking-widest">Duração (Dias Úteis)</label>
                      <input 
                        type="number"
                        value={deadlineDuration}
                        onChange={(e) => setDeadlineDuration(e.target.value)}
                        className="w-full bg-white border border-primary/10 rounded-xl px-4 py-3 text-primary outline-none focus:border-primary/50 font-bold"
                        placeholder="Ex: 15"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={handleCalculateDeadline}
                    className="w-full py-4 bg-primary text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-primary/20"
                  >
                    <Scale size={18} />
                    CALCULAR VENCIMENTO
                  </button>

                  {deadlineResult && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-primary/5 border border-primary/10 rounded-xl p-6 text-center"
                    >
                      <div className="text-[10px] text-stone-500 uppercase font-black tracking-widest mb-2">Vencimento Estimado</div>
                      <div className="text-3xl font-display font-black text-secondary italic">
                        {deadlineResult.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </div>
                      <div className="text-[10px] text-primary/60 mt-2 font-black uppercase tracking-tight">
                        {deadlineResult.toLocaleDateString('pt-BR', { weekday: 'long' })}
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="bg-primary/5 rounded-2xl p-6 border border-primary/5">
                  <h3 className="text-[10px] font-black text-primary/40 uppercase tracking-[0.2em] mb-4">Regras Aplicadas</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { t: 'Dias Úteis', d: 'Art. 219 CPC/2015' },
                      { t: 'Recesso', d: '20/Dez a 20/Jan' },
                      { t: 'Feriados', d: 'Nacionais e SP' },
                      { t: 'Anuário', d: 'Vigente 2026' }
                    ].map((rule, i) => (
                      <div key={i} className="p-3 rounded-lg bg-white border border-primary/5 shadow-sm">
                        <div className="text-primary text-[10px] font-black uppercase mb-1">{rule.t}</div>
                        <div className="text-[9px] text-stone-400 font-bold uppercase leading-tight">{rule.d}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCalculator && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCalculator(false)}
              className="fixed inset-0 bg-black/60 z-20"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 w-full bg-[var(--color-background)] border-t border-primary/10 rounded-t-[32px] p-8 z-30 pb-safe max-h-[95vh] flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-4 items-end">
                  <div>
                    <h2 className="font-display font-medium text-2xl text-primary">Calculadora</h2>
                    <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-1">Ferramentas Jurídicas</p>
                  </div>
                  <div className="bg-primary/5 p-1 rounded-lg flex gap-1 mb-1">
                    <button 
                      onClick={() => setCalcMode('simple')}
                      className={cn(
                        "px-3 py-1 rounded text-[10px] font-bold uppercase transition-all",
                        calcMode === 'simple' ? "bg-primary text-white" : "text-stone-500 hover:text-primary"
                      )}
                    >
                      Simples
                    </button>
                    <button 
                      onClick={() => setCalcMode('legal')}
                      className={cn(
                        "px-3 py-1 rounded text-[10px] font-bold uppercase transition-all",
                        calcMode === 'legal' ? "bg-secondary text-white" : "text-stone-500 hover:text-secondary"
                      )}
                    >
                      Jurídica
                    </button>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCalculator(false)}
                  className="p-2 bg-primary/5 rounded-full text-primary hover:bg-primary/10 transition-colors"
                >
                  <XIcon size={20} />
                </button>
              </div>

              <div className="flex-1 flex flex-col md:flex-row gap-8 overflow-hidden">
                {calcMode === 'simple' ? (
                  <>
                    {/* Calculator Interface */}
                    <div className="flex-1 flex flex-col">
                      {/* Display */}
                      <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6 mb-6 text-right flex flex-col justify-end min-h-[120px]">
                        <div className="text-stone-500 text-sm font-mono truncate h-6">{calcExpression}</div>
                        <div className="text-primary text-4xl font-display font-bold tabular-nums truncate mt-2">
                          {isNaN(Number(calcDisplay)) ? calcDisplay : 
                            calcDisplay.includes('.') ? 
                            Number(calcDisplay).toLocaleString('pt-BR', { maximumFractionDigits: 8 }) : 
                            Number(calcDisplay).toLocaleString('pt-BR')}
                        </div>
                      </div>

                      {/* Keys */}
                      <div className="grid grid-cols-4 gap-3">
                        {['C', '÷', '×', 'DEL', '7', '8', '9', '-', '4', '5', '6', '+', '1', '2', '3', '=', '0', '.'].map((key) => (
                          <button
                            key={key}
                            onClick={() => handleCalcClick(key)}
                            className={cn(
                              "h-14 rounded-xl flex items-center justify-center font-bold text-sm transition-transform active:scale-95",
                              key === '=' ? "bg-primary text-white col-span-1 shadow-lg shadow-primary/20" : 
                              key === 'C' ? "bg-secondary/10 text-secondary" :
                              ['÷', '×', '-', '+'].includes(key) ? "bg-primary/10 text-primary" :
                              key === '0' ? "bg-stone-200 text-primary col-span-1" :
                              "bg-stone-200 text-primary"
                            )}
                          >
                            {key === 'DEL' ? <Delete size={18} /> : 
                            key === '÷' ? <Divide size={18} /> :
                            key === '×' ? <XIcon size={18} /> :
                            key === '-' ? <Minus size={18} /> :
                            key === '+' ? <Plus size={18} /> :
                            key === '=' ? <Equal size={18} /> : 
                            key}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="hidden md:block w-px bg-primary/10 h-full" />

                    <div className="flex-1 flex flex-col min-h-[200px] md:min-h-0">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest">Histórico Simples</h3>
                        {calcHistory.length > 0 && (
                          <button 
                            onClick={() => setCalcHistory([])}
                            className="text-[10px] text-primary/60 hover:text-primary font-bold"
                          >
                            LIMPAR
                          </button>
                        )}
                      </div>
                      
                      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                        {calcHistory.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-stone-300">
                            <History size={32} strokeWidth={1} />
                            <span className="text-[10px] uppercase tracking-widest mt-2">Vazio</span>
                          </div>
                        ) : (
                          calcHistory.map((h) => (
                            <div 
                              key={h.id} 
                              onClick={() => {
                                setCalcExpression(h.result);
                                setCalcDisplay(h.result);
                              }}
                              className="p-3 rounded-lg bg-primary/5 border border-transparent hover:border-primary/10 cursor-pointer transition-colors text-right group"
                            >
                              <div className="text-[10px] text-stone-400 font-mono mb-1">{h.expression}</div>
                              <div className="text-primary font-display font-medium">{h.result}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                    {/* Legal Calc Panel */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden">
                      {/* Inputs */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center bg-primary/5 p-3 rounded-xl border border-primary/10">
                          <div className="flex items-center gap-2">
                            <Scale size={16} className="text-primary" />
                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Usar Índices Reais (IPCA/SELIC)</span>
                          </div>
                          <button 
                            onClick={() => setUseRealRates(!useRealRates)}
                            className={cn(
                              "w-10 h-5 rounded-full transition-colors relative",
                              useRealRates ? "bg-primary" : "bg-stone-300"
                            )}
                          >
                            <div className={cn(
                              "absolute top-1 w-3 h-3 rounded-full bg-white transition-all",
                              useRealRates ? "right-1" : "left-1"
                            )} />
                          </button>
                        </div>

                        {!useRealRates && (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Juros Mensal (%)</label>
                              <div className="flex bg-white/50 border border-primary/10 rounded-xl px-4 py-3">
                                <Percent size={14} className="text-primary mr-2 mt-1" />
                                <input 
                                  type="number" 
                                  value={legalInterestRate}
                                  onChange={(e) => setLegalInterestRate(e.target.value)}
                                  className="bg-transparent border-none outline-none text-primary w-full text-sm font-bold"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Correção Total (%)</label>
                              <div className="flex bg-white/50 border border-primary/10 rounded-xl px-4 py-3">
                                <Gavel size={14} className="text-primary mr-2 mt-1" />
                                <input 
                                  type="number" 
                                  value={legalCorrectionIndex}
                                  onChange={(e) => setLegalCorrectionIndex(e.target.value)}
                                  className="bg-transparent border-none outline-none text-primary w-full text-sm font-bold"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {useRealRates && (
                          <div className="p-3 bg-primary/5 border border-primary/10 rounded-xl">
                            <p className="text-[8px] text-primary uppercase font-bold tracking-[0.1em] leading-tight">
                              Regra Lei 14.905/2024: Correção pelo IPCA e juros pela taxa SELIC subtraída da variação do IPCA.
                            </p>
                          </div>
                        )}

                        <div className="bg-primary/5 border border-primary/10 p-4 rounded-2xl space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Descrição do Débito</label>
                            <input 
                              type="text"
                              value={legalDescription}
                              onChange={(e) => setLegalDescription(e.target.value)}
                              placeholder="Ex: Aluguel Atrasado"
                              className="w-full bg-white/50 border border-primary/10 rounded-xl px-4 py-3 text-sm text-primary outline-none focus:border-primary/50"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Valor Original</label>
                              <input 
                                type="text"
                                value={legalValue}
                                onChange={(e) => setLegalValue(formatCurrencyValue(e.target.value))}
                                placeholder="R$ 0,00"
                                className="w-full bg-white/50 border border-primary/10 rounded-xl px-4 py-3 text-sm text-primary outline-none focus:border-primary/50 font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Data de Vencimento</label>
                              <input 
                                type="date"
                                value={legalDate}
                                onChange={(e) => setLegalDate(e.target.value)}
                                className="w-full bg-white/50 border border-primary/10 rounded-xl px-4 py-3 text-sm text-primary outline-none focus:border-primary/50"
                              />
                            </div>
                          </div>
                          <button 
                            onClick={addLegalDebit}
                            disabled={isFetchingRates}
                            className="w-full py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
                          >
                            {isFetchingRates ? (
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <PlusCircle size={18} />
                            )}
                            {isFetchingRates ? 'BUSCANDO ÍNDICES...' : 'ADICIONAR DÉBITO'}
                          </button>
                        </div>

                        {legalDebits.length > 0 && (
                          <button 
                            onClick={exportPDF}
                            className="w-full py-3 bg-white border border-primary/10 text-primary rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-stone-50 transition-all shadow-sm"
                          >
                            <Download size={18} className="text-secondary" />
                            EXPORTAR RELATÓRIO PDF
                          </button>
                        )}
                      </div>

                      {/* Items List */}
                      <div className="flex-1 flex flex-col h-full overflow-hidden">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest">Planilha de Cálculos</h3>
                          <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded uppercase font-bold">
                            Total: R$ {legalDebits.reduce((acc, d) => acc + (d.totalValue || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                          {legalDebits.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-stone-300">
                              <FileText size={32} strokeWidth={1} />
                              <span className="text-[10px] uppercase tracking-widest mt-2">Vazio</span>
                            </div>
                          ) : (
                            legalDebits.map((d) => (
                              <motion.div 
                                key={d.id}
                                layout
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="p-4 rounded-xl bg-white border border-primary/5 relative group shadow-sm hover:shadow-md transition-shadow"
                              >
                                <button 
                                  onClick={() => removeLegalDebit(d.id)}
                                  className="absolute top-2 right-2 p-1 text-stone-300 hover:text-rose-500 transition-colors"
                                >
                                  <XIcon size={14} />
                                </button>
                                <div className="flex justify-between items-start mb-2">
                                  <div className="pr-6">
                                    <h4 className="text-primary font-bold text-sm truncate max-w-[200px]">{d.description}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Calendar size={10} className="text-stone-400" />
                                      <span className="text-[9px] text-stone-400 font-bold uppercase tracking-tighter">
                                        Vcto: {new Date(d.date).toLocaleDateString('pt-BR')}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-stone-400 text-[10px]">Total do Item</div>
                                    <div className="text-primary font-display font-medium">
                                      R$ {d.totalValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 border-t border-primary/5 pt-2 mt-2">
                                  <div className="text-center">
                                    <div className="text-[8px] text-stone-400 uppercase font-bold">Principal</div>
                                    <div className="text-[10px] text-stone-500 font-bold">R$ {d.value.toLocaleString('pt-BR')}</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-[8px] text-stone-400 uppercase font-bold">Juros</div>
                                    <div className="text-[10px] text-secondary font-bold">R$ {d.interestValue?.toLocaleString('pt-BR')}</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-[8px] text-stone-400 uppercase font-bold">Corr.</div>
                                    <div className="text-[10px] text-primary/80 font-bold">R$ {(d.correctedValue! - d.value).toLocaleString('pt-BR')}</div>
                                  </div>
                                </div>
                              </motion.div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/60 z-20"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 w-full bg-[var(--color-background)] border-t border-primary/10 rounded-t-[32px] p-8 z-30 pb-safe max-h-[85vh] flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="font-display font-medium text-2xl text-primary">Arquivo de Sessões</h2>
                  <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-1">Registros Recentes</p>
                </div>
                <div className="flex gap-2">
                  {history.length > 0 && (
                    <button 
                      onClick={() => {
                        if (confirm('Deseja limpar todos os registros de arquivo?')) setHistory([]);
                      }}
                      className="p-2 bg-rose-50 text-rose-500 border border-rose-100 rounded-full hover:bg-rose-100 transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                  <button 
                    onClick={() => setShowHistory(false)}
                    className="p-2 bg-primary/5 rounded-full text-primary hover:bg-primary/10 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-stone-300">
                    <History size={48} strokeWidth={1} />
                    <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em]">Sem registros arquivados</p>
                  </div>
                ) : (
                  history.map((entry) => (
                    <motion.div 
                      key={entry.id}
                      className="bg-white border border-primary/5 p-4 rounded-xl flex items-center justify-between shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center border",
                          entry.type === 'focus' ? 'bg-primary border-primary text-white' : entry.type === 'short' ? 'bg-secondary border-secondary text-white' : 'bg-primary/10 border-primary/20 text-primary'
                        )}>
                          {entry.type === 'focus' ? (
                            <CheckCircle2 className="w-6 h-6" />
                          ) : (
                            <Coffee className="w-6 h-6" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-primary text-sm capitalize">
                            {entry.type === 'focus' ? 'Sessão de Foco' : entry.type === 'short' ? 'Pausa Curta' : 'Descanso em Lote'}
                          </p>
                          <p className="text-[10px] text-stone-400 font-black uppercase tracking-tight mt-0.5">
                            {new Date(entry.timestamp).toLocaleDateString('pt-BR')} • {new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[11px] font-black text-primary bg-primary/5 border border-primary/5 px-2.5 py-1 rounded-lg italic">
                          {entry.duration} MIN
                        </span>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        .safe-area-inset {
          padding-top: env(safe-area-inset-top);
          padding-bottom: env(safe-area-inset-bottom);
          padding-left: env(safe-area-inset-left);
          padding-right: env(safe-area-inset-right);
        }
        .pb-safe {
          padding-bottom: calc(2rem + env(safe-area-inset-bottom));
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
