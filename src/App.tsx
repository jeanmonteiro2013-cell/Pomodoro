/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, where, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, orderBy, onSnapshot, getDoc } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './lib/firebase';
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
  Moon,
  Bell
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
  type: 'debit' | 'cost';
  correctionFactor: number;
  interestFactor: number;
  correctionValue: number;
  interestValue: number;
  totalValue: number;
}

interface Settings {
  focus: number;
  short: number;
  long: number;
  notificationsEnabled: boolean;
  theme: 'light' | 'dark';
}

interface DeadlineDayDetail {
  date: string;
  isBusiness: boolean;
  reason?: string;
  count?: number;
}

const DEFAULT_SETTINGS: Settings = {
  focus: 60,
  short: 10,
  long: 20,
  notificationsEnabled: true,
  theme: 'light',
};

// --- Holiday & Deadline Helpers ---

const HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': 'Confraternização Universal',
  '2026-01-25': 'Aniversário de São Paulo (Cidade)',
  '2026-02-16': 'Carnaval',
  '2026-02-17': 'Carnaval',
  '2026-04-03': 'Sexta-feira Santa',
  '2026-04-21': 'Tiradentes',
  '2026-05-01': 'Dia do Trabalho',
  '2026-06-04': 'Corpus Christi',
  '2026-07-09': 'Revolução Constitucionalista (Estado)',
  '2026-09-07': 'Independência',
  '2026-10-12': 'Padroeira do Brasil',
  '2026-11-02': 'Finados',
  '2026-11-15': 'Proclamação da República',
  '2026-11-20': 'Dia da Consciência Negra',
  '2026-12-25': 'Natal',
};

function getDayStatus(date: Date): { isBusiness: boolean; reason?: string } {
  const day = date.getDay();
  if (day === 0 || day === 6) return { isBusiness: false, reason: 'Final de Semana' };
  
  const dateStr = date.toISOString().split('T')[0];
  if (HOLIDAYS_2026[dateStr]) return { isBusiness: false, reason: `Feriado: ${HOLIDAYS_2026[dateStr]}` };
  
  // Recesso Forense (Dec 20 - Jan 20)
  const month = date.getMonth();
  const dayOfMonth = date.getDate();
  if (
    (month === 11 && dayOfMonth >= 20) || 
    (month === 0 && dayOfMonth <= 20)
  ) {
    return { isBusiness: false, reason: 'Recesso Forense (Art. 220 CPC)' };
  }
  
  return { isBusiness: true };
}

function calculateDeadlineDetailed(startDate: Date, duration: number) {
  const timeline: DeadlineDayDetail[] = [];
  let count = 0;
  let current = new Date(startDate);
  
  // Initial date info (protocolo/publicação)
  timeline.push({
    date: current.toISOString().split('T')[0],
    isBusiness: false,
    reason: 'Início (D0)'
  });

  // Deadlines start counting the next business day
  current = new Date(current);
  current.setDate(current.getDate() + 1);
  
  const maxSafety = 500; // Prevent infinite loops
  let iterations = 0;

  while (count < duration && iterations < maxSafety) {
    iterations++;
    const status = getDayStatus(current);
    
    if (status.isBusiness) {
      count++;
      timeline.push({
        date: current.toISOString().split('T')[0],
        isBusiness: true,
        count: count
      });
    } else {
      timeline.push({
        date: current.toISOString().split('T')[0],
        isBusiness: false,
        reason: status.reason
      });
    }
    
    if (count < duration) {
      current.setDate(current.getDate() + 1);
    }
  }
  
  return {
    finalDate: current,
    timeline
  };
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
  const [deadlineTimeline, setDeadlineTimeline] = useState<DeadlineDayDetail[]>([]);

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
    const { finalDate, timeline } = calculateDeadlineDetailed(new Date(deadlineStart), Number(deadlineDuration));
    setDeadlineResult(finalDate);
    setDeadlineTimeline(timeline);
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
  const [legalItemType, setLegalItemType] = useState<'debit' | 'cost'>('debit');
  const [attorneyFeesPercent, setAttorneyFeesPercent] = useState('10');

  // Firebase State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [userCalculations, setUserCalculations] = useState<any[]>([]);
  const [currentCalculationId, setCurrentCalculationId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [calculationTitle, setCalculationTitle] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSInstallGuide, setShowIOSInstallGuide] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);
    
    // @ts-ignore
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsStandalone(isPWA);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS && !isStandalone) {
      setShowIOSInstallGuide(true);
      return;
    }

    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Local sync prevention (to avoid feedback loops)
  const isInitialLoad = useRef(true);

  // Refs for timer management
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Logic ---

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setUserCalculations([]);
      return;
    }

    const q = query(
      collection(db, 'calculations'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const calcs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUserCalculations(calcs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'calculations');
    });

    return () => unsubscribe();
  }, [user]);

  // Sync Tasks with Cloud
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'tasks'),
      where('userId', '==', user.uid),
      orderBy('order', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cloudTasks = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title || data.text || '', // handle both just in case
          completed: data.completed,
          createdAt: data.createdAt || Date.now(),
          priority: data.priority,
          dueDate: data.dueDate
        } as Task;
      });
      
      setTasks(cloudTasks);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tasks');
    });

    return () => unsubscribe();
  }, [user]);

  // Sync Settings with Cloud
  useEffect(() => {
    if (!user) return;

    const docRef = doc(db, 'userSettings', user.uid);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const cloudSettings = snapshot.data() as Settings;
        setSettings(prev => ({
          ...prev,
          focus: cloudSettings.focus || prev.focus,
          short: cloudSettings.short || prev.short,
          long: cloudSettings.long || prev.long,
          notificationsEnabled: cloudSettings.notificationsEnabled ?? prev.notificationsEnabled,
          theme: cloudSettings.theme || prev.theme
        }));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `userSettings/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSaveCalculation = async () => {
    if (!user) {
      alert("Faça login para salvar seus cálculos.");
      return;
    }

    if (legalDebits.length === 0) return;

    setIsSaving(true);
    try {
      const data = {
        userId: user.uid,
        title: calculationTitle || `Cálculo ${new Date().toLocaleDateString('pt-BR')}`,
        items: legalDebits,
        attorneyFeesPercent: Number(attorneyFeesPercent),
        useRealRates: useRealRates,
        updatedAt: serverTimestamp(),
      };

      if (currentCalculationId) {
        await updateDoc(doc(db, 'calculations', currentCalculationId), data);
      } else {
        const docRef = await addDoc(collection(db, 'calculations'), {
          ...data,
          createdAt: serverTimestamp(),
        });
        setCurrentCalculationId(docRef.id);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'calculations');
    } finally {
      setIsSaving(false);
    }
  };

  const loadCalculation = (calc: any) => {
    setLegalDebits(calc.items);
    setAttorneyFeesPercent(String(calc.attorneyFeesPercent));
    setUseRealRates(calc.useRealRates);
    setCalculationTitle(calc.title);
    setCurrentCalculationId(calc.id);
  };

  const startNewCalculation = () => {
    setLegalDebits([]);
    setCalculationTitle('');
    setCurrentCalculationId(null);
  };

  const deleteCalculation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Tem certeza que deseja excluir este cálculo?")) return;
    try {
      await deleteDoc(doc(db, 'calculations', id));
      if (currentCalculationId === id) startNewCalculation();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `calculations/${id}`);
    }
  };

  // Legal Calculator Logic
  const fetchLegalRates = async (date: string) => {
    setIsFetchingRates(true);
    try {
      let startYear, startMonth;
      if (date.includes('-')) {
        const [y, m, d] = date.split('-');
        startYear = y;
        startMonth = m;
      } else {
        const d = new Date(date);
        startYear = d.getFullYear();
        startMonth = (d.getMonth() + 1).toString().padStart(2, '0');
      }
      
      const start = `01/${startMonth}/${startYear}`;
      const today = new Date();
      // Use the last day of last month to ensure data existence if very recent
      const end = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
      
      // Fetch directly from BCB API (CORS is supported)
      const ipcaResponse = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=${start}&dataFinal=${end}`);
      const ipcaData = await ipcaResponse.json();

      const selicResponse = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados?formato=json&dataInicial=${start}&dataFinal=${end}`);
      const selicData = await selicResponse.json();

      const data = { ipca: ipcaData, selic: selicData };
      
      if (!data.ipca || data.ipca.length === 0) {
        console.warn("No IPCA data found for this period.");
        return { correction: 0, interest: 0, warning: "Dados do IPCA indisponíveis para este período. Verifique a data inicial." };
      }

      // Calculate total IPCA and total SELIC using cumulative logic
      // V_final = V_inicial * (1 + i1) * (1 + i2) ...
      let cumulativeIpca = 1;
      data.ipca.forEach((item: any) => {
        const val = parseFloat(item.valor.replace(',', '.')) / 100;
        if (!isNaN(val)) cumulativeIpca *= (1 + val);
      });
      
      let cumulativeSelic = 1;
      if (data.selic && data.selic.length > 0) {
        data.selic.forEach((item: any) => {
          const val = parseFloat(item.valor.replace(',', '.')) / 100;
          if (!isNaN(val)) cumulativeSelic *= (1 + val);
        });
      }

      const totalIpcaPercent = (cumulativeIpca - 1) * 100;
      const totalSelicPercent = (cumulativeSelic - 1) * 100;
      
      // Law 14.905/2024 logic: Interest = SELIC - IPCA (min 0)
      const calculatedInterestPercent = Math.max(0, totalSelicPercent - totalIpcaPercent);
      
      return {
        correction: totalIpcaPercent,
        interest: calculatedInterestPercent
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

    const principal = numericValue;
    const months = Math.max(0, Math.floor((Date.now() - new Date(legalDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
    
    // If using real rates, our fetcher returns the "total percentage" for the period
    // If not, the interest input is usually "per month"
    const finalInterestTotalRate = legalItemType === 'cost' ? 0 : (useRealRates ? currentInterest : (currentInterest * months));
    const finalCorrectionTotalRate = currentCorrection;
    
    // Correct way: Interest applies on TOP of the corrected value
    const correctionValue = principal * (finalCorrectionTotalRate / 100);
    const correctedPrincipal = principal + correctionValue;
    const interestValue = correctedPrincipal * (finalInterestTotalRate / 100);
    
    const newDebit: LegalDebit = {
      id: generateId(),
      description: legalDescription || (legalItemType === 'debit' ? `Débito ${legalDebits.length + 1}` : `Custo ${legalDebits.length + 1}`),
      value: principal,
      date: legalDate,
      type: legalItemType,
      correctionFactor: finalCorrectionTotalRate,
      interestFactor: finalInterestTotalRate,
      correctionValue: correctionValue,
      interestValue: interestValue,
      totalValue: correctedPrincipal + interestValue
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
    const subtotal = legalDebits.reduce((acc, d) => acc + (d.totalValue || 0), 0);
    const fees = subtotal * (Number(attorneyFeesPercent) / 100);
    const grandTotal = subtotal + fees;
    
    doc.setFontSize(18);
    doc.text("Planilha de Débitos Jurídicos Detalhada", 14, 22);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 14, 30);
    doc.text(`Regra de Juros: ${useRealRates ? "SELIC - IPCA (Lei 14.905/2024)" : `${legalInterestRate}%/mês`}`, 14, 35);
    doc.text(`Honorários Advocatícios: ${attorneyFeesPercent}%`, 14, 40);

    const tableData = legalDebits.map(d => [
      d.description,
      new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR'),
      d.type === 'debit' ? 'Principal' : 'Custo',
      `R$ ${d.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `R$ ${d.correctionValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${d.correctionFactor.toFixed(2)}%)`,
      `R$ ${d.interestValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${d.interestFactor.toFixed(2)}%)`,
      `R$ ${d.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    ]);

    autoTable(doc, {
      startY: 45,
      head: [['Descrição', 'Data', 'Tipo', 'Original', 'Correção', 'Juros', 'Subtotal']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [244, 63, 94] },
      styles: { fontSize: 8 }
    });

    const lastY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(`Subtotal dos Itens: R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 140, lastY);
    doc.text(`Honorários (${attorneyFeesPercent}%): R$ ${fees.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 140, lastY + 6);
    doc.setFontSize(12);
    doc.setTextColor(244, 63, 94);
    doc.text(`TOTAL GERAL: R$ ${grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 140, lastY + 14);

    doc.save(`calculo_juridico_${new Date().getTime()}.pdf`);
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

  const playSound = useCallback((type: 'focus' | 'short' | 'long') => {
    if (!soundEnabled) return;
    
    let audioUrl = '';
    if (type === 'focus') audioUrl = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
    else if (type === 'short') audioUrl = 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3';
    else audioUrl = 'https://assets.mixkit.co/active_storage/sfx/2190/2190-preview.mp3';

    const audio = new Audio(audioUrl);
    audio.play().catch(e => console.error("Audio play failed:", e));
  }, [soundEnabled]);

  // Sync History with Cloud
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'history'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cloudHistory = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as HistoryEntry));
      
      setHistory(cloudHistory);
    });

    return () => unsubscribe();
  }, [user]);

  const recordSession = useCallback(async (type: SessionType) => {
    const newEntryObj = {
      type,
      duration: settings[type],
      timestamp: Date.now(),
      taskId: type === 'focus' ? activeTaskId || undefined : undefined,
    };

    if (user) {
      try {
        await addDoc(collection(db, 'history'), {
          ...newEntryObj,
          userId: user.uid
        });
      } catch (err) {
        console.error("Cloud record session error:", err);
      }
    } else {
      const newEntry: HistoryEntry = {
        ...newEntryObj,
        id: generateId(),
      };
      setHistory(prev => [newEntry, ...prev]);
    }
  }, [settings, activeTaskId, user]);

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    const newTaskObj = {
      title: newTaskTitle.trim(),
      completed: false,
      createdAt: Date.now(),
      priority: taskPriority,
      dueDate: taskDueDate || undefined,
      order: tasks.length
    };

    if (user) {
      try {
        await addDoc(collection(db, 'tasks'), {
          ...newTaskObj,
          userId: user.uid,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'tasks');
      }
    } else {
      const newTask: Task = {
        ...newTaskObj,
        id: generateId(),
      };
      setTasks(prev => [newTask, ...prev]);
    }

    setNewTaskTitle('');
    setTaskDueDate('');
    setTaskPriority('low');
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (user) {
      try {
        await updateDoc(doc(db, 'tasks', id), {
          completed: !task.completed,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `tasks/${id}`);
      }
    } else {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    }
  };

  const deleteTask = async (id: string) => {
    if (user) {
      try {
        await deleteDoc(doc(db, 'tasks', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `tasks/${id}`);
      }
    } else {
      setTasks(prev => prev.filter(t => t.id !== id));
    }
    if (activeTaskId === id) setActiveTaskId(null);
  };

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      playSound(sessionType);
      
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

  // Persist settings & Cloud Sync
  useEffect(() => {
    if (!isInitialLoad.current) {
      try {
        localStorage.setItem('zen_pomo_settings', JSON.stringify(settings));
      } catch (e) { console.error("Save settings error:", e); }

      if (user) {
        const syncSettings = async () => {
          try {
            const { setDoc } = await import('firebase/firestore');
            await setDoc(doc(db, 'userSettings', user.uid), {
              ...settings,
              userId: user.uid,
              updatedAt: serverTimestamp()
            }, { merge: true });
          } catch (e) {
            console.error("Cloud settings sync error:", e);
          }
        };
        syncSettings();
      }
    }

    // Apply theme
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    isInitialLoad.current = false;
  }, [settings, user]);

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
      <header className="fixed top-0 left-0 w-full p-4 md:p-6 flex justify-between items-center z-10 bg-background/50 backdrop-blur-sm md:bg-transparent">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 md:gap-3"
        >
          <div className="bg-primary p-2 rounded-xl text-background">
            <Scale size={20} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-primary font-display font-extrabold text-lg md:text-2xl leading-none tracking-tight">POMODORO</h1>
            <p className="text-[7px] md:text-[9px] text-primary/70 uppercase font-bold tracking-[0.3em] mt-0.5">ESTRATÉGICO</p>
          </div>
        </motion.div>

        <div className="flex items-center gap-1 md:gap-2">
          {(deferredPrompt || (isIOS && !isStandalone)) && (
            <button 
              onClick={handleInstallClick}
              className="flex items-center gap-2 p-1 md:p-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all group mr-2"
              title="Instalar App"
            >
              <Download size={16} />
              <span className="hidden md:block text-[10px] font-black uppercase tracking-widest">Instalar App</span>
            </button>
          )}
          {user ? (
            <button 
              onClick={logout}
              className="flex items-center gap-2 p-1 md:p-2 bg-primary/5 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all group"
              title="Sair"
            >
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-background text-[10px] font-black uppercase">
                {user.email?.substring(0, 2)}
              </div>
              <span className="hidden md:block text-[10px] font-black uppercase tracking-widest">Sair</span>
            </button>
          ) : (
            <button 
              onClick={signInWithGoogle}
              className="flex items-center gap-2 p-2 bg-primary/5 rounded-xl text-primary hover:bg-primary hover:text-background transition-all"
              title="Entrar com Google"
            >
              <Scale size={20} className="md:w-6 md:h-6" />
              <span className="hidden md:block text-[10px] font-black uppercase tracking-widest">Login</span>
            </button>
          )}

          <button 
            onClick={() => setShowDeadlines(true)}
            className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors"
            title="Contador de Prazos"
          >
            <Scale size={20} className="md:w-6 md:h-6" />
          </button>
          <button 
            onClick={() => setShowCalculator(true)}
            className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors"
            title="Calculadora"
          >
            <Calculator size={20} className="md:w-6 md:h-6" />
          </button>
          <button 
            onClick={() => setShowTasks(true)}
            className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors relative"
            title="Tarefas"
          >
            <ListTodo size={20} className="md:w-6 md:h-6" />
            {tasks.filter(t => !t.completed).length > 0 && (
              <span className="absolute top-1 right-1 w-3 h-3 md:w-4 md:h-4 bg-secondary text-white text-[8px] md:text-[10px] flex items-center justify-center rounded-full font-bold shadow-sm">
                {tasks.filter(t => !t.completed).length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors"
            title="Configurações"
          >
            <Settings2 size={20} className="md:w-6 md:h-6" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 mt-16 max-w-full">
        <motion.div 
          animate={{ scale: isActive ? 1.02 : 1 }}
          className={cn(
            "w-full max-w-md bg-card/40 backdrop-blur-3xl border border-primary/5 rounded-[48px] p-8 md:p-12 shadow-2xl transition-all duration-700",
            isActive ? "shadow-primary/20 ring-1 ring-primary/10" : "shadow-primary/5"
          )}
        >
          {/* Mode Switcher */}
          {!isActive && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-center gap-1 bg-primary/5 p-1.5 rounded-2xl mb-12"
            >
              {[
                { id: 'focus', icon: Brain, label: 'Foco' },
                { id: 'short', icon: Coffee, label: 'Pausa' },
                { id: 'long', icon: Battery, label: 'Descanso' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSessionType(m.id as SessionType)}
                  className={cn(
                    "flex items-center gap-2 px-4 md:px-6 py-3 rounded-xl transition-all duration-500",
                    sessionType === m.id 
                      ? "bg-primary text-background shadow-lg shadow-primary/20 scale-105" 
                      : "text-primary/40 hover:text-primary hover:bg-primary/5"
                  )}
                >
                  <m.icon size={14} className="md:size-4" />
                  <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">{m.label}</span>
                </button>
              ))}
            </motion.div>
          )}

          {/* Main Timer Display */}
          <div className="relative aspect-square flex items-center justify-center mb-8 md:mb-12">
            {/* Progress Circle Wrapper */}
            <div className="absolute inset-0">
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="50%"
                  cy="50%"
                  r="48%"
                  className="stroke-primary/5 fill-none"
                  strokeWidth="1"
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
                {isActive && (
                  <motion.circle
                    cx="50%"
                    cy="50%"
                    r="48%"
                    className="stroke-primary/20 fill-none"
                    strokeWidth="8"
                    animate={{ scale: [1, 1.05, 1], opacity: [0.1, 0.3, 0.1] }}
                    transition={{ duration: 4, repeat: Infinity }}
                  />
                )}
              </svg>
            </div>
            
            <div className="flex flex-col items-center">
              <motion.span 
                key={timeLeft}
                animate={{ scale: isActive ? 1.05 : 1 }}
                className={cn(
                  "text-7xl md:text-8xl font-display font-black text-primary tabular-nums tracking-tight transition-all duration-300",
                  isActive && "drop-shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]"
                )}
              >
                {formatTime(timeLeft)}
              </motion.span>
              <div className="mt-4 flex flex-col items-center gap-1">
                <p className="text-[9px] md:text-[10px] text-primary/30 uppercase font-black tracking-[0.4em] overflow-hidden">
                  {sessionType === 'focus' ? 'ALTA PERFORMANCE' : 'RECUPERAÇÃO ESTRATÉGICA'}
                </p>
                <AnimatePresence mode="wait">
                  {activeTaskId && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/10 border border-secondary/5 rounded-full mt-2"
                    >
                      <div className="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse" />
                      <span className="text-[9px] md:text-[10px] text-secondary font-black uppercase truncate max-w-[150px]">
                        {tasks.find(t => t.id === activeTaskId)?.title}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-6 md:gap-8">
            <button
              onClick={resetTimer}
              className="w-14 h-14 md:w-16 md:h-16 rounded-full border border-primary/10 flex items-center justify-center text-primary/60 hover:bg-primary/5 hover:text-primary transition-all active:scale-90"
              title="Reiniciar"
            >
              <RotateCcw size={20} className="md:size-24" />
            </button>
            
            <button
              onClick={() => setIsActive(!isActive)}
              className={cn(
                "w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 active:scale-95",
                isActive 
                  ? "bg-rose-500 text-white shadow-rose-500/30" 
                  : "bg-primary text-background shadow-primary/30 hover:scale-105"
              )}
            >
              {isActive ? <Pause size={28} md:size-32 fill="currentColor" /> : <Play size={28} md:size-32 fill="currentColor" className="ml-1" />}
            </button>

            <button
              onClick={() => {
                const nextType = sessionType === 'focus' ? 'short' : 'focus';
                setSessionType(nextType);
                setIsActive(false);
                setTimeLeft(settings[nextType] * 60);
              }}
              className="w-14 h-14 md:w-16 md:h-16 rounded-full border border-primary/10 flex items-center justify-center text-primary/60 hover:bg-primary/5 hover:text-primary transition-all active:scale-90"
              title="Próximo"
            >
              <ChevronRight size={20} className="md:size-24" />
            </button>
          </div>
        </motion.div>
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
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 300 }}
              className="fixed bottom-0 left-0 w-full bg-[var(--color-background)] border-t border-primary/10 rounded-t-[32px] z-50 pb-safe max-h-[92vh] flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center p-8 pb-4 bg-background/80 backdrop-blur-md sticky top-0 z-10 rounded-t-[32px]">
                <div>
                  <h2 className="font-display font-bold text-2xl text-primary">Configurações</h2>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-1">Personalize sua experiência</p>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 bg-primary/5 rounded-full text-primary hover:bg-primary/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 pt-2 space-y-8 custom-scrollbar">
                {(['focus', 'short', 'long'] as SessionType[]).map((type) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center border",
                        type === 'focus' ? 'bg-primary border-primary text-background' : type === 'short' ? 'bg-secondary border-secondary text-white' : 'bg-primary/10 border-primary/20 text-primary'
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
                        <p className="text-[10px] text-stone-400 uppercase tracking-widest font-black mt-1">Minutos</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setSettings({ ...settings, [type]: Math.max(1, Number(settings[type]) - 1) })}
                        className="w-8 h-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center text-primary hove:bg-primary hover:text-white transition-all active:scale-95"
                      >
                        <Minus size={14} />
                      </button>
                      <input 
                        type="number"
                        min="1"
                        max="120"
                        value={settings[type] || ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val)) {
                            setSettings({ ...settings, [type]: Math.max(1, Math.min(120, val)) });
                          } else if (e.target.value === '') {
                            // Temporary allow empty state while typing
                            setSettings({ ...settings, [type]: '' as any });
                          }
                        }}
                        onBlur={() => {
                          if (!settings[type] || isNaN(Number(settings[type]))) {
                            setSettings({ ...settings, [type]: 25 });
                          }
                        }}
                        className="w-12 text-center font-display font-bold text-lg text-primary bg-transparent outline-none border-b border-transparent focus:border-primary/20 hover:border-primary/10 transition-colors"
                      />
                      <button 
                        onClick={() => setSettings({ ...settings, [type]: Math.min(120, Number(settings[type]) + 1) })}
                        className="w-8 h-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-background">
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
                      settings.theme === 'dark' ? "bg-primary" : "bg-stone-300/30"
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
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-background">
                      <Bell size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-primary text-sm">Notificações</p>
                      <p className="text-[10px] text-stone-400 uppercase tracking-widest font-black mt-1">{settings.notificationsEnabled ? 'Ativadas' : 'Desativadas'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSettings({ ...settings, notificationsEnabled: !settings.notificationsEnabled })}
                    className={cn(
                      "w-12 h-6 rounded-full p-1 transition-colors duration-300",
                      settings.notificationsEnabled ? "bg-primary" : "bg-stone-300/30"
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
                  className="w-full py-4 bg-primary text-background rounded-2xl font-bold uppercase tracking-widest mt-4 shadow-lg active:scale-[0.98] transition-transform"
                >
                  Concluir
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
              transition={{ type: "spring", damping: 32, stiffness: 300 }}
              className="fixed bottom-0 left-0 w-full bg-[var(--color-background)] border-t border-primary/10 rounded-t-[32px] z-50 pb-safe max-h-[92vh] flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center p-8 pb-4 bg-background/80 backdrop-blur-md sticky top-0 z-10 rounded-t-[32px]">
                <div>
                  <h2 className="font-display font-bold text-2xl text-primary">Diretório de Tarefas</h2>
                  <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold mt-1">Gestão de Workflow Jurídico</p>
                </div>
                <button 
                  onClick={() => setShowTasks(false)}
                  className="p-2 bg-primary/5 rounded-full text-primary hover:bg-primary/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 pt-2 space-y-6 custom-scrollbar">
                {/* Task modal content ... */}
                <div className="bg-card border border-primary/10 rounded-2xl p-6 shadow-sm">
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
                        className="p-2 bg-primary text-background rounded-lg hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
                      >
                        <Plus size={24} />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-stone-500 uppercase font-black tracking-widest">Prazo Fatal</label>
                        <input 
                          type="date"
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="bg-primary/5 border border-primary/10 rounded-lg px-3 py-2 text-primary text-xs outline-none focus:border-primary font-bold"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-stone-500 uppercase font-black tracking-widest">Gravidade</label>
                        <select 
                          value={taskPriority}
                          onChange={(e) => setTaskPriority(e.target.value as any)}
                          className="bg-primary/5 border border-primary/10 rounded-lg px-3 py-2 text-primary text-xs outline-none focus:border-primary font-bold"
                        >
                          <option value="low">Baixa</option>
                          <option value="medium">Média</option>
                          <option value="high">Alta</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
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
                                <span className="text-[9px] text-stone-400 font-bold uppercase tracking-tight flex items-center gap-1">
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
                        <div className="flex items-center gap-2">
                          {!task.completed && (
                            <button 
                              onClick={() => setActiveTaskId(task.id === activeTaskId ? null : task.id)}
                              className={cn(
                                "text-[10px] font-bold px-3 py-1.5 rounded-xl transition-all uppercase",
                                activeTaskId === task.id ? "bg-primary text-background shadow-lg" : "text-primary/60 hover:text-primary hover:bg-primary/5"
                              )}
                            >
                              {activeTaskId === task.id ? 'FOCO' : 'FOCAR'}
                            </button>
                          )}
                          <button 
                            onClick={() => deleteTask(task.id)}
                            className="p-2 text-stone-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
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
                        const isHoliday = dateStr && HOLIDAYS_2026[dateStr];
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
                                <span className="text-[7px] text-secondary font-black uppercase truncate px-1 max-w-[50px]" title={HOLIDAYS_2026[dateStr]}>
                                  {HOLIDAYS_2026[dateStr].split(' ')[0]}
                                </span>
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
              transition={{ type: "spring", damping: 32, stiffness: 300 }}
              className="fixed bottom-0 left-0 w-full bg-[var(--color-background)] border-t border-primary/10 rounded-t-[32px] z-50 pb-safe max-h-[95vh] flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center p-6 pb-4 bg-background/80 backdrop-blur-sm sticky top-0 z-10 rounded-t-[32px]">
                <div>
                  <h2 className="font-display font-bold text-2xl text-primary">Contador de Prazos</h2>
                  <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-1">CPC/2015 - Dias Úteis</p>
                </div>
                <button 
                  onClick={() => setShowDeadlines(false)}
                  className="p-2 bg-primary/5 rounded-full text-primary hover:bg-primary/10 transition-colors"
                >
                  <XIcon size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6 custom-scrollbar">
                <div className="bg-white border border-primary/10 rounded-2xl p-6 space-y-6 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-stone-500 uppercase font-black tracking-widest">Início do Prazo</label>
                      <input 
                        type="date"
                        value={deadlineStart}
                        onChange={(e) => setDeadlineStart(e.target.value)}
                        className="w-full bg-primary/5 border border-primary/10 rounded-xl px-4 py-3 text-primary outline-none focus:border-primary/50 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-stone-500 uppercase font-black tracking-widest">Duração (Dias Úteis)</label>
                      <input 
                        type="number"
                        value={deadlineDuration}
                        onChange={(e) => setDeadlineDuration(e.target.value)}
                        className="w-full bg-primary/5 border border-primary/10 rounded-xl px-4 py-3 text-primary outline-none focus:border-primary/50 font-bold text-sm"
                        placeholder="Ex: 15"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={handleCalculateDeadline}
                    className="w-full py-4 bg-primary text-background rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg"
                  >
                    <Scale size={18} />
                    CALCULAR VENCIMENTO
                  </button>

                  {deadlineResult && (
                    <div className="space-y-6">
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-primary/5 border border-primary/10 rounded-xl p-6 text-center"
                      >
                        <div className="text-[10px] text-stone-500 uppercase font-black tracking-widest mb-1">Vencimento Estimado</div>
                        <div className="text-2xl md:text-3xl font-display font-bold text-secondary">
                          {deadlineResult.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </div>
                        <div className="text-[10px] text-primary font-bold mt-1 uppercase">
                          {deadlineResult.toLocaleDateString('pt-BR', { weekday: 'long' })}
                        </div>
                      </motion.div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-end px-2">
                          <div>
                            <h4 className="text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Memória de Cálculo</h4>
                            <p className="text-[9px] text-stone-400 font-bold mt-0.5">Confira o cronograma detalhado abaixo</p>
                          </div>
                          <div className="text-[9px] font-black text-primary/60 uppercase">
                            {deadlineTimeline.filter(d => d.isBusiness).length} dias úteis
                          </div>
                        </div>

                        <div className="bg-card border border-primary/5 rounded-2xl overflow-hidden divide-y divide-primary/5 shadow-inner bg-stone-50/30">
                          {deadlineTimeline.map((item, idx) => (
                            <div key={idx} className={cn(
                              "px-4 py-3 flex items-center justify-between transition-colors",
                              item.isBusiness ? "bg-white" : "bg-primary/[0.02]"
                            )}>
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black",
                                  item.isBusiness ? "bg-primary text-background" : "bg-stone-200 text-stone-400"
                                )}>
                                  {item.count || idx}
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-primary">
                                    {new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                  </div>
                                  <div className="text-[9px] text-stone-400 font-bold uppercase">
                                    {new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="text-right">
                                {item.isBusiness ? (
                                  <span className="text-[8px] font-black text-primary/40 uppercase tracking-[0.1em] bg-primary/5 px-2 py-0.5 rounded">Útil</span>
                                ) : (
                                  <span className={cn(
                                    "text-[8px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded",
                                    item.reason === 'Início (D0)' ? "bg-stone-100 text-stone-400" : "bg-rose-50 text-rose-500 shadow-sm shadow-rose-100/50"
                                  )}>
                                    {item.reason}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-primary/5 rounded-2xl p-6 border border-primary/5">
                  <h3 className="text-[10px] font-black text-primary/40 uppercase tracking-[0.2em] mb-4">Informações Importantes</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { t: 'Dias Úteis', d: 'Contagem exclusiva em dias úteis (Art. 219 CPC).' },
                      { t: 'Prazos Jurídicos', d: 'Suspensão de 20 de dez a 20 de jan (Art. 220 CPC).' }
                    ].map((rule, i) => (
                      <div key={i} className="p-3 rounded-lg bg-background border border-primary/5">
                        <div className="text-primary text-[10px] font-black uppercase mb-1">{rule.t}</div>
                        <div className="text-[9px] text-stone-400 font-bold leading-tight">{rule.d}</div>
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
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 300 }}
              className="fixed bottom-0 left-0 w-full bg-[var(--color-background)] border-t border-primary/10 rounded-t-[32px] z-50 pb-safe max-h-[92vh] flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center p-8 pb-4 bg-background/80 backdrop-blur-md sticky top-0 z-10 rounded-t-[32px]">
                <div className="flex gap-4 items-center">
                  <div>
                    <h2 className="font-display font-bold text-2xl text-primary">Calculadora</h2>
                    <div className="bg-primary/5 p-1 rounded-lg flex gap-1 mt-1">
                      <button 
                        onClick={() => setCalcMode('simple')}
                        className={cn(
                          "px-3 py-0.5 rounded text-[10px] font-bold uppercase transition-all",
                          calcMode === 'simple' ? "bg-primary text-background shadow-sm" : "text-stone-500"
                        )}
                      >
                        Simples
                      </button>
                      <button 
                        onClick={() => setCalcMode('legal')}
                        className={cn(
                          "px-3 py-0.5 rounded text-[10px] font-bold uppercase transition-all",
                          calcMode === 'legal' ? "bg-secondary text-white shadow-sm" : "text-stone-500"
                        )}
                      >
                        Jurídica
                      </button>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCalculator(false)}
                  className="p-2 bg-primary/5 rounded-full text-primary hover:bg-primary/10 transition-colors"
                >
                  <XIcon size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 pt-2 space-y-8 custom-scrollbar">
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

                      <div className="flex-1 min-w-0 md:min-h-0">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Histórico Operacional</h3>
                          {calcHistory.length > 0 && (
                            <button 
                              onClick={() => setCalcHistory([])}
                              className="text-[9px] text-rose-400 hover:text-rose-600 font-black uppercase transition-colors"
                            >
                              Resetar
                            </button>
                          )}
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                          {calcHistory.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full py-8 text-stone-200">
                              <History size={24} strokeWidth={1} />
                              <span className="text-[9px] font-black uppercase tracking-widest mt-2">Sem registros</span>
                            </div>
                          ) : (
                            calcHistory.map((h) => (
                              <div 
                                key={h.id} 
                                onClick={() => {
                                  setCalcExpression(h.result);
                                  setCalcDisplay(h.result);
                                }}
                                className="p-3 rounded-xl bg-primary/5 border border-primary/5 hover:border-primary/20 cursor-pointer transition-all text-right group hover:scale-[1.02]"
                              >
                                <div className="text-[9px] text-stone-400 font-mono mb-0.5">{h.expression}</div>
                                <div className="text-sm text-primary font-display font-bold tabular-nums"> = {h.result}</div>
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
                        <div className="flex justify-between items-center bg-primary/5 p-4 rounded-2xl border border-primary/10">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-background">
                              <Scale size={20} />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-primary block leading-tight">Índices Automáticos</span>
                              <p className="text-[9px] text-stone-400 font-black uppercase tracking-tight">IPCA / SELIC em tempo real</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => setUseRealRates(!useRealRates)}
                            className={cn(
                              "w-12 h-6 rounded-full transition-all duration-300 relative p-1",
                              useRealRates ? "bg-primary" : "bg-stone-300"
                            )}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                              useRealRates ? "translate-x-6" : "translate-x-0"
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
                          <div className="flex gap-1 bg-white/50 p-1 rounded-xl border border-primary/10">
                            <button 
                              onClick={() => setLegalItemType('debit')}
                              className={cn(
                                "flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all",
                                legalItemType === 'debit' ? "bg-primary text-background shadow-sm" : "text-stone-400"
                              )}
                            >
                              Débito
                            </button>
                            <button 
                              onClick={() => setLegalItemType('cost')}
                              className={cn(
                                "flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all",
                                legalItemType === 'cost' ? "bg-secondary text-white shadow-sm" : "text-stone-400"
                              )}
                            >
                              Custo Judicial
                            </button>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Descrição</label>
                            <input 
                              type="text"
                              value={legalDescription}
                              onChange={(e) => setLegalDescription(e.target.value)}
                              placeholder={legalItemType === 'debit' ? "Ex: Indenização" : "Ex: Custas Iniciais"}
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
                          <div className="space-y-4">
                            <div className="bg-secondary/5 border border-secondary/10 p-4 rounded-2xl">
                              <label className="text-[10px] text-secondary font-black uppercase tracking-widest mb-2 block">Honorários Advocatícios (%)</label>
                              <div className="flex bg-white/70 border border-secondary/20 rounded-xl px-4 py-3">
                                <Scale size={16} className="text-secondary mr-2 mt-0.5" />
                                <input 
                                  type="number" 
                                  value={attorneyFeesPercent}
                                  onChange={(e) => setAttorneyFeesPercent(e.target.value)}
                                  className="bg-transparent border-none outline-none text-secondary w-full text-sm font-bold"
                                />
                              </div>
                            </div>

                            <button 
                              onClick={exportPDF}
                              className="w-full py-3 bg-white border border-primary/10 text-primary rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-stone-50 transition-all shadow-sm"
                            >
                              <Download size={18} className="text-secondary" />
                              EXPORTAR RELATÓRIO PDF
                            </button>
                          </div>
                        )}
                      </div>

                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <div className="flex justify-between items-end mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xs font-black text-stone-500 uppercase tracking-widest">Planilha de Cálculos</h3>
                        {currentCalculationId && (
                          <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                            <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" /> SALVO NA NUVEM
                          </span>
                        )}
                      </div>
                      <input 
                        type="text"
                        value={calculationTitle}
                        onChange={(e) => setCalculationTitle(e.target.value)}
                        placeholder="Título do Cálculo (ex: Processo 0001234...)"
                        className="w-full bg-transparent border-none text-primary font-bold text-sm outline-none placeholder:text-stone-300"
                      />
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-right">
                        <div className="text-[10px] text-primary/40 uppercase font-black tracking-widest text-[9px]">Total Líquido</div>
                        <div className="text-xl font-display font-black text-primary">
                          R$ {legalDebits.reduce((acc, d) => acc + (d.totalValue || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {legalDebits.length > 0 && (
                          <button 
                            onClick={handleSaveCalculation}
                            disabled={isSaving}
                            className={cn(
                              "px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2",
                              isSaving ? "bg-stone-100 text-stone-400" : "bg-primary text-background shadow-lg shadow-primary/20 hover:scale-105"
                            )}
                          >
                            {isSaving ? 'Salvando...' : (currentCalculationId ? 'Atualizar Cloud' : 'Salvar na Nuvem')}
                          </button>
                        )}
                        {currentCalculationId && (
                          <button 
                            onClick={startNewCalculation}
                            className="px-4 py-2 bg-stone-100 text-stone-600 rounded-xl text-[10px] font-black uppercase hover:bg-stone-200 transition-colors"
                          >
                            Novo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 flex gap-6 overflow-hidden">
                    <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2 mb-4">
                      {legalDebits.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-stone-200">
                          <FileText size={48} strokeWidth={1} />
                          <span className="text-[10px] font-black uppercase tracking-widest mt-4">Nenhum item adicionado</span>
                        </div>
                      ) : (
                        legalDebits.map((d) => (
                                <motion.div 
                                  key={d.id}
                                  layout
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className="p-5 rounded-2xl bg-white border border-primary/10 relative group shadow-sm hover:shadow-lg transition-all"
                                >
                                  <button 
                                    onClick={() => removeLegalDebit(d.id)}
                                    className="absolute top-3 right-3 p-1.5 bg-rose-50 text-rose-300 hover:text-rose-600 rounded-full transition-all opacity-0 group-hover:opacity-100"
                                  >
                                    <XIcon size={12} />
                                  </button>
                                  
                                  <div className="flex justify-between items-start mb-4">
                                    <div>
                                      <div className={cn(
                                        "text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full inline-block mb-1",
                                        d.type === 'debit' ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
                                      )}>
                                        {d.type === 'debit' ? 'Principal' : 'Custo Judicial'}
                                      </div>
                                      <h4 className="text-primary font-bold text-base leading-tight">{d.description}</h4>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Calendar size={10} className="text-stone-400" />
                                        <span className="text-[9px] text-stone-400 font-bold uppercase tracking-tight">
                                          Vcto: {new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-stone-400 text-[10px] font-bold uppercase">Subtotal</div>
                                      <div className="text-lg font-display font-black text-primary">
                                        R$ {d.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-3 gap-4 border-t border-primary/5 pt-4">
                                    <div className="space-y-0.5">
                                      <div className="text-[8px] text-stone-400 uppercase font-black tracking-widest">Base (D0)</div>
                                      <div className="text-xs text-primary font-bold tabular-nums">R$ {d.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    </div>
                                    <div className="space-y-0.5">
                                      <div className="text-[8px] text-secondary uppercase font-black tracking-widest">Juros ({d.interestFactor.toFixed(2)}%)</div>
                                      <div className="text-xs text-secondary font-bold tabular-nums">+ R$ {d.interestValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    </div>
                                    <div className="space-y-0.5">
                                      <div className="text-[8px] text-primary/60 uppercase font-black tracking-widest">Correção ({d.correctionFactor.toFixed(2)}%)</div>
                                      <div className="text-xs text-primary/80 font-bold tabular-nums">+ R$ {d.correctionValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    </div>
                                  </div>
                                </motion.div>
                              ))
                            )}
                        </div>

                        {/* Cloud History Sidebar */}
                        {user && userCalculations.length > 0 && (
                          <div className="w-64 flex flex-col gap-4 border-l border-primary/5 pl-6">
                            <div className="flex justify-between items-center">
                              <h3 className="text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Histórico Cloud</h3>
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" title="Sincronizado" />
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                              {userCalculations.map((calc) => (
                                <button 
                                  key={calc.id}
                                  onClick={() => loadCalculation(calc)}
                                  className={cn(
                                    "w-full text-left p-3 rounded-2xl border transition-all relative group",
                                    currentCalculationId === calc.id 
                                      ? "bg-primary/10 border-primary/20 shadow-sm" 
                                      : "bg-white border-primary/5 hover:border-primary/20 hover:bg-primary/[0.02]"
                                  )}
                                >
                                  <div onClick={(e) => deleteCalculation(calc.id, e)} className="absolute -top-1 -right-1 p-1 bg-rose-50 text-rose-300 hover:text-rose-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                    <X size={10} />
                                  </div>
                                  <div className="text-[10px] font-bold text-primary truncate pr-4">{calc.title}</div>
                                  <div className="flex justify-between items-center mt-2">
                                    <span className="text-[8px] text-stone-400 font-bold uppercase tracking-tight">
                                      {calc.updatedAt?.toDate()?.toLocaleDateString('pt-BR') || 'Salvo agora'}
                                    </span>
                                    <span className="text-[10px] font-black text-primary">
                                      R$ {calc.items.reduce((acc: number, d: any) => acc + d.totalValue, 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {legalDebits.length > 0 && (
                            <motion.div 
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="bg-gradient-to-br from-primary to-primary-dark p-6 rounded-3xl text-white shadow-2xl shadow-primary/30"
                            >
                              <div className="flex justify-between items-center opacity-60 text-[10px] font-black uppercase tracking-[0.2em] mb-4 border-b border-white/10 pb-4">
                                <span>Resumo Consolidado</span>
                                <span>R$ {legalDebits.reduce((acc, d) => acc + d.totalValue, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                              
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <div className="text-[10px] font-bold uppercase opacity-80">Subtotal Líquido</div>
                                  <div className="text-sm font-bold">R$ {legalDebits.reduce((acc, d) => acc + d.totalValue, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                </div>
                                <div className="flex justify-between items-center text-secondary-light">
                                  <div className="text-[10px] font-bold uppercase">Honorários ({attorneyFeesPercent}%)</div>
                                  <div className="text-sm font-bold">
                                    + R$ {(legalDebits.reduce((acc, d) => acc + d.totalValue, 0) * (Number(attorneyFeesPercent) / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </div>
                                </div>
                                <div className="pt-4 border-t border-white/20 flex justify-between items-center">
                                  <div className="text-xs font-black uppercase tracking-widest">Total Geral</div>
                                  <div className="text-2xl font-display font-black">
                                    R$ {(legalDebits.reduce((acc, d) => acc + d.totalValue, 0) * (1 + Number(attorneyFeesPercent) / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
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

        {/* iOS Install Guide Dialog */}
        {showIOSInstallGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm border border-primary/10 shadow-2xl relative"
            >
              <button 
                onClick={() => setShowIOSInstallGuide(false)}
                className="absolute right-4 top-4 text-stone-400 hover:text-stone-800 transition-colors"
              >
                <XIcon size={20} />
              </button>
              
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4 mx-auto">
                <Download size={24} />
              </div>
              
              <h2 className="text-xl font-bold text-center text-primary mb-2">Instalar no iOS</h2>
              <p className="text-sm text-stone-500 text-center mb-6">
                Para instalar o Pomodoro no seu iPhone ou iPad, siga os passos abaixo:
              </p>
              
              <ol className="space-y-4 text-sm text-stone-700">
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/5 border border-primary/20 flex items-center justify-center font-bold text-xs shrink-0 text-primary">1</div>
                  <p>Toque no ícone de <strong>Compartilhar</strong> na barra inferior do Safari.</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/5 border border-primary/20 flex items-center justify-center font-bold text-xs shrink-0 text-primary">2</div>
                  <p>Role para baixo e toque em <strong>Adicionar à Tela de Início</strong>.</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/5 border border-primary/20 flex items-center justify-center font-bold text-xs shrink-0 text-primary">3</div>
                  <p>Toque em <strong>Adicionar</strong> no canto superior direito.</p>
                </li>
              </ol>
              
              <button 
                onClick={() => setShowIOSInstallGuide(false)}
                className="w-full py-3 mt-8 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold transition-colors"
              >
                Entendi
              </button>
            </motion.div>
          </motion.div>
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
