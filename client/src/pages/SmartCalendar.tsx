"use client"
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, 
  Clock, 
  Users, 
  Calendar as CalendarIcon, 
  Sparkles,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Trash2,
  ExternalLink,
  MapPin,
  Bell,
  X
} from "lucide-react";
import { analytics } from "@/utils/analytics";
import GlassmorphismButton from "@/components/ui/glassmorphism-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameDay, getYear, getMonth, startOfWeek, endOfWeek } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuthLoading } from "@/contexts/AuthContext";
import { SkeletonLoader } from "@/components/ui/page-loader";
import React, { Suspense } from "react";

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // <-- string, not Date
  time: string;
  duration: number; // in minutes
  location?: string;
  type: 'study' | 'exam' | 'assignment' | 'personal' | 'group';
  color: string;
  reminder?: number; // minutes before
  googleEventId?: string;
  attachments?: string[];
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  date: Date;
  priority: 'low' | 'medium' | 'high';
}

// ErrorBoundary for SmartCalendar
class CalendarErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, info: any) { console.error('SmartCalendar error:', error, info); }
  render() { if (this.state.hasError) return <div className="text-red-500 text-center py-8">Something went wrong in Calendar.</div>; return this.props.children; }
}

const SmartCalendar = () => {
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showYearSelector, setShowYearSelector] = useState(false);
  const [showMonthSelector, setShowMonthSelector] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', priority: 'medium' as 'low' | 'medium' | 'high' });
  
  // Real analytics data
  const [studyTimeData, setStudyTimeData] = useState(() => analytics.getStudyTimeThisWeek());
  const [currentStreak, setCurrentStreak] = useState(() => analytics.getCurrentStreak());
  const [totalStudyHours, setTotalStudyHours] = useState(() => analytics.getTotalStudyHours());
  const [taskStats, setTaskStats] = useState(() => analytics.getTaskCompletionStats());
  const [completionRate, setCompletionRate] = useState(() => analytics.getWeeklyCompletionRate());
  
  // Event and task storage
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  
  const [tasks, setTasks] = useState<Task[]>(() => {
    return [];
  });

  // Define typeDefaults at the top of the component
  const typeDefaults = {
    study: { title: 'Study Session', duration: 60 },
    exam: { title: 'Exam', duration: 120 },
    assignment: { title: 'Assignment Due', duration: 30 },
    group: { title: 'Group Study', duration: 90 },
    personal: { title: 'Personal Event', duration: 60 }
  };

  // 1. Add date to newEvent state and bind to input
  // newEvent.date is always a string (yyyy-mm-dd)
  const [newEvent, setNewEvent] = useState<Partial<CalendarEvent> & { date: string }>({
    title: '',
    description: '',
    date: '',
    time: '09:00',
    duration: 60,
    type: 'study',
    color: '#3B82F6',
    reminder: 15
  });

  // Add state for event attachments
  const [isSavingEvent, setIsSavingEvent] = useState(false);

  const isAuthLoading = useAuthLoading();
  const [isEventsLoading, setIsEventsLoading] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL;

  // Fetch events from backend on mount
  useEffect(() => {
    if (isAuthLoading) return;
    setIsEventsLoading(true);
    const token = localStorage.getItem('authToken');
    fetch(`${API_URL}/api/calendar`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setEvents(data.map((e: any) => ({ ...e, date: typeof e.date === 'string' ? e.date : (new Date(e.date)).toISOString().split('T')[0] })));
      })
      .catch(() => setEvents([]))
      .finally(() => setIsEventsLoading(false));
  }, [isAuthLoading]);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`${API_URL}/api/calendar/tasks`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("Failed to fetch tasks");
        const data: Task[] = await res.json();
        setTasks(data);
      } catch (e: any) {
        toast({ title: "Failed to load tasks", description: e.message, variant: "destructive" });
      }
    };
    fetchTasks();
  }, [toast]);

  // Refresh analytics data
  const refreshAnalytics = () => {
    setStudyTimeData(analytics.getStudyTimeThisWeek());
    setCurrentStreak(analytics.getCurrentStreak());
    setTotalStudyHours(analytics.getTotalStudyHours());
    setTaskStats(analytics.getTaskCompletionStats());
    setCompletionRate(analytics.getWeeklyCompletionRate());
  };

  // Event type colors
  const eventColors = {
    study: '#3B82F6',
    exam: '#EF4444',
    assignment: '#F59E0B',
    personal: '#10B981',
    group: '#8B5CF6'
  };

  // Navigation functions
  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(direction === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
  };

  const navigateToToday = () => {
    setCurrentDate(new Date());
  };

  // Get calendar days for current view
  const getCalendarDays = () => {
    const start = startOfWeek(startOfMonth(currentDate));
    const end = endOfWeek(endOfMonth(currentDate));
    return eachDayOfInterval({ start, end });
  };

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    return events.filter(event => isSameDay(new Date(event.date), date));
  };

  // Get tasks for a specific date
  const getTasksForDate = (date: Date) => {
    return tasks.filter(task => isSameDay(task.date, date));
  };

  // Add or update event (persistent)
  const saveEvent = async () => {
    setIsSavingEvent(true);
    if (!newEvent.title || !newEvent.date) return;
    const eventData: any = {
      title: newEvent.title,
      description: newEvent.description,
      date: newEvent.date,
      time: newEvent.time,
      duration: newEvent.duration,
      location: newEvent.location,
      type: newEvent.type,
      color: eventColors[newEvent.type!],
      reminder: newEvent.reminder,
    };
    try {
      let res, saved;
      const token = localStorage.getItem('authToken');
      if (editingEvent) {
        res = await fetch(`${API_URL}/api/calendar/${editingEvent.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ...eventData,
          })
        });
      } else {
        res = await fetch(`${API_URL}/api/calendar`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ...eventData,
          })
        });
      }
      if (!res.ok) throw new Error("Failed to save event");
      saved = await res.json();
      fetch(`${API_URL}/api/calendar`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setEvents(data.map((e: any) => ({ ...e, date: typeof e.date === 'string' ? e.date : (new Date(e.date)).toISOString().split('T')[0] }))));
      toast({ title: editingEvent ? "Event Updated" : "Event Created", description: `Event ${editingEvent ? "updated" : "created"} successfully.` });
      resetEventDialog();
    } catch (e: any) {
      toast({ title: "Save Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSavingEvent(false);
    }
  };

  // Delete event (persistent)
  const deleteEvent = async (eventId: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_URL}/api/calendar/${eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete event");
      fetch(`${API_URL}/api/calendar`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setEvents(data.map((e: any) => ({ ...e, date: typeof e.date === 'string' ? e.date : (new Date(e.date)).toISOString().split('T')[0] }))));
      toast({ title: "Event Deleted", description: "Event has been removed." });
    } catch (e: any) {
      toast({ title: "Delete Failed", description: e.message, variant: "destructive" });
    }
  };

  // Reset event dialog
  const resetEventDialog = () => {
    setShowEventDialog(false);
    setEditingEvent(null);
    setNewEvent({
      title: '',
      description: '',
      date: '', // <-- reset date
      time: '09:00',
      duration: 60,
      type: 'study',
      color: '#3B82F6',
      reminder: 15
    });
    setSelectedDate(null);
  };

  // Open event dialog for specific date with optional event type preset
  const openEventDialog = (date: Date, event?: CalendarEvent, eventType?: 'study' | 'exam' | 'assignment' | 'personal' | 'group') => {
    if (event) {
      setEditingEvent(event);
      setNewEvent({
        title: event.title,
        description: event.description,
        date: event.date,
        time: event.time,
        duration: event.duration,
        location: event.location,
        type: event.type,
        color: event.color,
        reminder: event.reminder,
      });
      // Do not setSelectedDate to a string
    } else {
      const dateStr = date.toISOString().split('T')[0];
      setNewEvent({
        title: eventType ? typeDefaults[eventType].title : '',
        description: '',
        date: dateStr,
        time: '09:00',
        duration: eventType ? typeDefaults[eventType].duration : 60,
        type: eventType || 'study',
        color: eventType ? eventColors[eventType] : '#3B82F6',
        reminder: 15,
      });
      // Do not setSelectedDate to a string
    }
    setShowEventDialog(true);
  };

  // Year and month navigation
  const navigateToYear = (year: number) => {
    const newDate = new Date(currentDate);
    newDate.setFullYear(year);
    setCurrentDate(newDate);
    setShowYearSelector(false);
  };

  const navigateToMonth = (month: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(month);
    setCurrentDate(newDate);
    setShowMonthSelector(false);
  };

  // Generate year range for selector
  const getYearRange = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear - 10; i <= currentYear + 10; i++) {
      years.push(i);
    }
    return years;
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // --- Add edit and delete task functionality, edit dialog, and UI icons ---
  // 1. Add state for editing a task
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTaskData, setEditTaskData] = useState({ title: '', priority: 'medium' as 'low' | 'medium' | 'high' });

  // 2. Edit task handler
  const openEditTaskDialog = (task: Task) => {
    setEditingTask(task);
    setEditTaskData({ title: task.title, priority: task.priority });
    setShowTaskDialog(false);
  };

  const saveEditTask = async () => {
    if (!editingTask) return;
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_URL}/api/calendar/tasks/${editingTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: editTaskData.title,
          priority: editTaskData.priority,
        })
      });
      if (!res.ok) throw new Error("Failed to update task");
      const updatedTask = await res.json();
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
      setEditingTask(null);
      toast({ title: "Task Updated", description: `Task "${updatedTask.title}" updated.` });
    } catch (e: any) {
      toast({ title: "Update Failed", description: e.message, variant: "destructive" });
    }
  };

  // 3. Delete task handler
  const deleteTask = async (taskId: string) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_URL}/api/calendar/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete task");
      setTasks(prev => prev.filter(t => t.id !== taskId));
      toast({ title: "Task Deleted", description: "Task has been removed." });
    } catch (e: any) {
      toast({ title: "Delete Failed", description: e.message, variant: "destructive" });
    }
  };

  // 4. Fix toggle complete to use PUT
  const toggleTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_URL}/api/calendar/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ completed: !task.completed })
      });
      if (!res.ok) throw new Error("Failed to update task");
      const updatedTask = await res.json();
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
      toast({ title: "Task Updated", description: `Task "${updatedTask.title}" updated.` });
    } catch (e: any) {
      toast({ title: "Update Failed", description: e.message, variant: "destructive" });
    }
  };

  // Add new task
  const addTask = async (title: string, date: Date, priority: 'low' | 'medium' | 'high' = 'medium') => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_URL}/api/calendar/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, date: date.toISOString().split('T')[0], priority })
      });
      if (!res.ok) throw new Error("Failed to add task");
      const newTask = await res.json();
      setTasks(prev => [...prev, newTask]);
      toast({ title: "Task Added", description: `Task "${newTask.title}" added.` });
    } catch (e: any) {
      toast({ title: "Add Failed", description: e.message, variant: "destructive" });
    }
  };

  // Handle task dialog
  const openTaskDialog = () => {
    setNewTask({ title: '', priority: 'medium' });
    setShowTaskDialog(true);
  };

  const saveTask = async () => {
    if (!newTask.title.trim()) return;
    
    await addTask(newTask.title, new Date(), newTask.priority);
    setShowTaskDialog(false);
    setNewTask({ title: '', priority: 'medium' });
  };

  // Generate Google Calendar link
  const generateGoogleCalendarLink = (event: CalendarEvent) => {
    const startDate = new Date(event.date);
    const [hours, minutes] = event.time.split(':').map(Number);
    startDate.setHours(hours, minutes);
    
    const endDate = new Date(startDate.getTime() + event.duration * 60000);
    
    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: `${formatDate(startDate)}/${formatDate(endDate)}`,
      details: event.description || '',
      location: event.location || ''
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  // AI suggestions based on current schedule
  const getAISuggestions = () => {
    const today = new Date();
    const todaysEvents = getEventsForDate(today);
    const upcomingExams = events.filter(e => e.type === 'exam' && new Date(e.date) > today).length;
    
    const suggestions = [];
    
    if (todaysEvents.length === 0) {
      suggestions.push("📚 Your schedule is free today - perfect time for focused study!");
    }
    
    if (upcomingExams > 0) {
      suggestions.push(`⚡ You have ${upcomingExams} upcoming exam${upcomingExams > 1 ? 's' : ''} - schedule review sessions`);
    }
    
    if (todaysEvents.length > 3) {
      suggestions.push("⏰ Busy day ahead - consider scheduling short breaks between sessions");
    }
    
    suggestions.push("🎯 Set up study reminders 15 minutes before each session");
    
    return suggestions;
  };

  const calendarDays = getCalendarDays();
  const todaysTasks = getTasksForDate(new Date());
  const aiSuggestions = getAISuggestions();

  // Defensive helpers
  const safeArray = <T,>(val: T[] | undefined): T[] => Array.isArray(val) ? val : [];
  const safeEvent = (event: any = {}): CalendarEvent => ({
    id: event.id?.toString() || Date.now().toString(),
    title: event.title || 'Untitled',
    description: event.description || '',
    date: typeof event.date === 'string' ? event.date : (new Date(event.date)).toISOString().split('T')[0],
    time: event.time || '',
    duration: typeof event.duration === 'number' ? event.duration : 60,
    location: event.location || '',
    type: event.type || 'personal',
    color: event.color || '#3b82f6',
    reminder: typeof event.reminder === 'number' ? event.reminder : 10,
    googleEventId: event.googleEventId || '',
    attachments: safeArray(event.attachments),
  });

  if (isEventsLoading) {
    return (
      <main className="relative z-10 pt-20">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <SkeletonLoader className="mb-6 w-1/2 h-10" lines={1} />
          <div className="grid grid-cols-7 gap-2 mb-8">
            {[...Array(7)].map((_, i) => (
              <SkeletonLoader key={i} className="h-8 rounded" lines={1} />
            ))}
            {[...Array(35)].map((_, i) => (
              <SkeletonLoader key={i} className="h-20 rounded-lg" lines={1} />
            ))}
          </div>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <SkeletonLoader key={i} className="h-16 rounded-xl" lines={2} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <CalendarErrorBoundary>
      <main className="relative z-10 pt-20">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <motion.h1 
              className="text-4xl font-bold mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              Smart Calendar
            </motion.h1>
            <motion.p 
              className="text-slate-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              Intelligent scheduling with AI-powered suggestions
            </motion.p>
          </div>
          
          <div className="grid lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-1 space-y-6">
              {/* Quick Actions */}
              <motion.div 
                className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
                <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">Quick Actions</h2>
                <div className="space-y-3">
                  <GlassmorphismButton
                    onClick={() => openEventDialog(selectedDate || new Date())}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Event
                  </GlassmorphismButton>
                  <GlassmorphismButton
                    onClick={() => openEventDialog(selectedDate || new Date(), undefined, 'study')}
                    variant="outline"
                    className="w-full"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Schedule Study Session
                  </GlassmorphismButton>
                  <GlassmorphismButton
                    onClick={() => openEventDialog(selectedDate || new Date(), undefined, 'group')}
                    variant="outline"
                    className="w-full"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Group Study
                  </GlassmorphismButton>
                  <GlassmorphismButton
                    onClick={navigateToToday}
                    variant="outline"
                    className="w-full"
                  >
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    Go to Today
                  </GlassmorphismButton>
                </div>
              </motion.div>

              {/* Today's Tasks */}
              <motion.div 
                className="glassmorphism rounded-xl p-6"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 dark:text-white">Today's Tasks</h3>
                <GlassmorphismButton
                  onClick={openTaskDialog}
                  variant="outline"
                  className="p-1"
                >
                  <Plus className="w-3 h-3" />
                </GlassmorphismButton>
              </div>
              <div className="space-y-2">
                {todaysTasks.length === 0 ? (
                  <div>
                    <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">No tasks for today</p>
                    <GlassmorphismButton
                      onClick={openTaskDialog}
                      variant="outline"
                      className="w-full text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Task
                    </GlassmorphismButton>
                  </div>
                ) : (
                    todaysTasks.map((task, index) => (
                    <motion.div
                        key={task.id}
                        className="flex items-center space-x-2 p-2 glassmorphism rounded cursor-pointer"
                        onClick={() => toggleTask(task.id)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                      whileHover={{ scale: 1.02 }}
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-400" />
                      )}
                      <span className={`text-sm flex-1 ${task.completed ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {task.title}
                      </span>
                      <div className={`w-2 h-2 rounded-full ${
                        task.priority === 'high' ? 'bg-red-500' :
                        task.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                      }`} />
                      <Edit3 onClick={e => { e.stopPropagation(); openEditTaskDialog(task); }} className="w-4 h-4 text-slate-500 hover:text-blue-500 cursor-pointer" />
                      <Trash2 onClick={e => { e.stopPropagation(); deleteTask(task.id); }} className="w-4 h-4 text-slate-500 hover:text-red-500 cursor-pointer" />
                    </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
              
              {/* AI Suggestions */}
              <motion.div 
                className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4, duration: 0.6 }}
              >
                <h3 className="font-semibold mb-3 flex items-center text-slate-900 dark:text-white">
                  <Sparkles className="w-4 h-4 mr-2 text-green-500" />
                  AI Suggestions
                </h3>
                <div className="space-y-2 text-sm">
                  {aiSuggestions.map((suggestion, index) => (
                    <motion.div
                      key={index}
                      className="p-2 bg-slate-50 dark:bg-slate-700 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors text-slate-800 dark:text-slate-200"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                      whileHover={{ scale: 1.02 }}
                    >
                      {suggestion}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>
            
            {/* Calendar */}
            <div className="lg:col-span-3">
              <motion.div 
                className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
                {/* Calendar Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => navigateMonth('prev')}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5 text-slate-900 dark:text-white" />
                    </button>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setShowMonthSelector(true)}
                        className="text-2xl font-bold text-slate-900 dark:text-white hover:text-blue-500 transition-colors"
                      >
                        {format(currentDate, 'MMMM')}
                      </button>
                      <button
                        onClick={() => setShowYearSelector(true)}
                        className="text-2xl font-bold text-slate-900 dark:text-white hover:text-blue-500 transition-colors"
                      >
                        {format(currentDate, 'yyyy')}
                      </button>
                    </div>
                    <button
                      onClick={() => navigateMonth('next')}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <ChevronRight className="w-5 h-5 text-slate-900 dark:text-white" />
                    </button>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-600 dark:text-slate-400 text-sm">Month View</span>
                  </div>
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1 mb-4">
                  {/* Day Headers */}
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div key={day} className="text-center py-2 text-slate-600 dark:text-slate-400 font-semibold">
                      {day}
                    </div>
                  ))}
                  
                  {/* Calendar Days */}
                  {calendarDays.map((day, index) => {
                    const dayEvents = getEventsForDate(day);
                    const dayTasks = getTasksForDate(day);
                    const isCurrentMonth = getMonth(day) === getMonth(currentDate);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    
                    return (
                      <motion.div
                        key={day.toISOString()}
                        className={`min-h-[120px] p-2 border border-slate-200 dark:border-slate-600 rounded-lg cursor-pointer transition-all duration-300 ${
                          isToday(day) ? 'border-blue-500 bg-blue-500/10' :
                          isSelected ? 'border-green-500 bg-green-500/10' :
                          isCurrentMonth ? 'hover:bg-slate-50 dark:hover:bg-slate-700' : 'opacity-50'
                        }`}
                        onClick={() => setSelectedDate(day)}
                        onDoubleClick={() => openEventDialog(day)}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.01, duration: 0.3 }}
                      >
                        <div className={`text-sm font-semibold mb-1 ${
                          isToday(day) ? 'text-blue-500' :
                          isCurrentMonth ? 'text-slate-900 dark:text-white' : 'text-slate-500'
                        }`}>
                          {format(day, 'd')}
                        </div>
                        
                        {/* Events */}
                        <div className="space-y-1">
                          {dayEvents.slice(0, 3).map((event) => (
                            <div
                              key={event.id}
                              className="text-xs p-1 rounded text-white truncate"
                              style={{ backgroundColor: event.color }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEventDialog(day, event);
                              }}
                            >
                              {event.time} {event.title}
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-xs text-slate-400">
                              +{dayEvents.length - 3} more
                            </div>
                          )}
                        </div>
                        
                        {/* Tasks indicator */}
                        {dayTasks.length > 0 && (
                          <div className="mt-1 flex items-center">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></div>
                            <span className="text-xs text-slate-400">{dayTasks.length}</span>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          </div>

          {/* Productivity Dashboard */}
          <div className="mt-12">
            <motion.div
              className="text-center mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl font-bold mb-4 text-slate-900 dark:text-white">Productivity Analytics</h2>
              <p className="text-slate-600 dark:text-slate-400">Track your study patterns and optimize your schedule</p>
            </motion.div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Study Time Analytics */}
              <motion.div
                className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
              >
                <h3 className="text-lg font-semibold mb-4 flex items-center text-slate-900 dark:text-white">
                  <Clock className="w-5 h-5 mr-2 text-blue-500" />
                  Study Time This Week
                </h3>
                <div className="space-y-4">
                  {studyTimeData.map((item, index) => (
                    <div key={item.day} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-700 dark:text-slate-300">{item.day}</span>
                        <span className="text-blue-500">{item.hours}h / {item.target}h</span>
                      </div>
                      <div className="bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <motion.div
                          className={`h-2 rounded-full ${
                            item.hours >= item.target ? 'bg-green-500' : 'bg-blue-500'
                          }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((item.hours / item.target) * 100, 100)}%` }}
                          transition={{ delay: 0.5 + index * 0.1, duration: 0.8 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Task Completion Rate */}
              <motion.div
                className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                <h3 className="text-lg font-semibold mb-4 flex items-center text-slate-900 dark:text-white">
                  <CheckCircle2 className="w-5 h-5 mr-2 text-green-500" />
                  Task Completion
                </h3>
                <div className="text-center mb-6">
                  <div className="text-4xl font-bold text-green-500 mb-2">{completionRate}%</div>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">This week's completion rate</p>
                </div>
                <div className="space-y-3">
                  {taskStats.map((item, index) => (
                    <div key={item.category} className="flex justify-between items-center">
                      <span className="text-sm text-slate-700 dark:text-slate-300">{item.category}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-slate-600 dark:text-slate-400">{item.completed}/{item.total}</span>
                        <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                          <motion.div
                            className="bg-green-500 h-2 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.completed / item.total) * 100}%` }}
                            transition={{ delay: 0.7 + index * 0.1, duration: 0.6 }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Study Streaks */}
              <motion.div
                className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                <h3 className="text-lg font-semibold mb-4 flex items-center text-slate-900 dark:text-white">
                  <Sparkles className="w-5 h-5 mr-2 text-yellow-500" />
                  Study Streaks
                </h3>
                <div className="space-y-4">
                  <div className="text-center p-4 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 rounded-lg border border-yellow-500/30">
                    <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mb-1">{currentStreak}</div>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">Day Streak</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{currentStreak > 0 ? 'Keep it up!' : 'Start your streak today!'}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700 dark:text-slate-300">Current Streak</span>
                      <span className="text-green-500">{currentStreak} days</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700 dark:text-slate-300">This Week</span>
                      <span className="text-blue-500">{studyTimeData.filter(d => d.hours > 0).length} days active</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700 dark:text-slate-300">Total Study Hours</span>
                      <span className="text-purple-500">{totalStudyHours}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>

        {/* Smart Scheduling Suggestions */}
        <div className="mt-12">
          <motion.div
            className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <h3 className="text-lg font-semibold mb-6 flex items-center text-slate-900 dark:text-white">
              <Sparkles className="w-5 h-5 mr-2 text-green-500" />
              Smart Scheduling Recommendations
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-medium text-blue-400">Optimal Study Times</h4>
                <div className="space-y-3">
                  {[
                    { time: "9:00 AM - 11:00 AM", reason: "Peak focus hours based on your history", score: 95 },
                    { time: "2:00 PM - 4:00 PM", reason: "High productivity window", score: 88 },
                    { time: "7:00 PM - 9:00 PM", reason: "Consistent evening performance", score: 82 }
                  ].map((slot, index) => (
                    <motion.div
                      key={index}
                      className="p-3 bg-white/90 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg border-l-4 border-blue-500"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-sm text-slate-900 dark:text-white">{slot.time}</span>
                        <span className="text-xs text-green-400">{slot.score}% match</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{slot.reason}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-medium text-green-600 dark:text-green-400">Schedule Optimization</h4>
                <div className="space-y-3">
                  {[
                    { suggestion: "Add 30min break between study sessions", benefit: "Improves retention by 23%" },
                    { suggestion: "Schedule difficult subjects in morning", benefit: "Leverages peak cognitive hours" },
                    { suggestion: "Group similar tasks together", benefit: "Reduces context switching" },
                    { suggestion: "Reserve Friday evenings for review", benefit: "Strengthens weekly learning" }
                  ].map((tip, index) => (
                    <motion.div
                      key={index}
                      className="p-3 bg-white/90 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg border-l-4 border-green-500"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                    >
                      <div className="font-medium text-sm mb-1 text-slate-900 dark:text-white">{tip.suggestion}</div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{tip.benefit}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Year Selector Dialog */}
        <Dialog open={showYearSelector} onOpenChange={setShowYearSelector}>
          <DialogContent className="max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-white/20">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white">Select Year</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-4 gap-2 mt-4 max-h-60 overflow-y-auto">
              {getYearRange().map((year) => (
                <button
                  key={year}
                  onClick={() => navigateToYear(year)}
                  className={`p-2 rounded-lg text-sm transition-colors ${
                    year === getYear(currentDate)
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Month Selector Dialog */}
        <Dialog open={showMonthSelector} onOpenChange={setShowMonthSelector}>
          <DialogContent className="max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-white/20">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white">Select Month</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {months.map((month, index) => (
                <button
                  key={month}
                  onClick={() => navigateToMonth(index)}
                  className={`p-3 rounded-lg text-sm transition-colors ${
                    index === getMonth(currentDate)
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {month}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Task Dialog */}
        <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
          <DialogContent className="max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-white/20">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white">Add New Task</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 mt-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Task Title
                </label>
                <Input
                  value={newTask.title}
                  onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter task title..."
                  className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Priority
                </label>
                <Select 
                  value={newTask.priority} 
                  onValueChange={(value: 'low' | 'medium' | 'high') => setNewTask(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                    <SelectItem value="low">Low Priority</SelectItem>
                    <SelectItem value="medium">Medium Priority</SelectItem>
                    <SelectItem value="high">High Priority</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <GlassmorphismButton variant="outline" onClick={() => setShowTaskDialog(false)}>
                  Cancel
                </GlassmorphismButton>
                <GlassmorphismButton 
                  onClick={saveTask}
                  disabled={!newTask.title.trim()}
                  className="bg-gradient-to-r from-blue-500 to-green-500"
                >
                  Add Task
                </GlassmorphismButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Event Dialog */}
        <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
          <DialogContent className="max-w-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-white/20">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white flex items-center space-x-2">
                <CalendarIcon className="w-5 h-5" />
                <span>{editingEvent ? 'Edit Event' : 'Add New Event'}</span>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 mt-6">
              {/* Date Field */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Date
                </label>
                <Input
                  type="date"
                  value={newEvent.date || ''}
                  onChange={e => setNewEvent(prev => ({ ...prev, date: e.target.value }))}
                  className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Event Title *
                  </label>
                  <Input
                    value={newEvent.title || ''}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter event title..."
                    className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Description
                  </label>
                  <Textarea
                    value={newEvent.description || ''}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Event description..."
                    className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Time
                    </label>
                    <Input
                      type="time"
                      value={newEvent.time || '09:00'}
                      onChange={(e) => setNewEvent(prev => ({ ...prev, time: e.target.value }))}
                      className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Duration (minutes)
                    </label>
                    <Input
                      type="number"
                      value={newEvent.duration || 60}
                      onChange={(e) => setNewEvent(prev => ({ ...prev, duration: parseInt(e.target.value) || 60 }))}
                      className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Location
                  </label>
                  <Input
                    value={newEvent.location || ''}
                    onChange={(e) => setNewEvent(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="Event location..."
                    className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Event Type
                    </label>
                    <Select 
                      value={newEvent.type} 
                      onValueChange={(value: 'study' | 'exam' | 'assignment' | 'personal' | 'group') => setNewEvent(prev => ({ ...prev, type: value, color: eventColors[value as keyof typeof eventColors] }))}
                    >
                      <SelectTrigger className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                        <SelectItem value="study">Study Session</SelectItem>
                        <SelectItem value="exam">Exam</SelectItem>
                        <SelectItem value="assignment">Assignment</SelectItem>
                        <SelectItem value="group">Group Study</SelectItem>
                        <SelectItem value="personal">Personal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Reminder (minutes before)
                    </label>
                    <Select 
                      value={newEvent.reminder?.toString()} 
                      onValueChange={(value) => setNewEvent(prev => ({ ...prev, reminder: parseInt(value) }))}
                    >
                      <SelectTrigger className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                        <SelectItem value="0">No reminder</SelectItem>
                        <SelectItem value="5">5 minutes</SelectItem>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4">
                  <div className="flex space-x-2">
                    {editingEvent && (
                      <GlassmorphismButton
                        variant="outline"
                        onClick={() => {
                          deleteEvent(editingEvent.id);
                          resetEventDialog();
                        }}
                        className="text-red-400 border-red-400 hover:bg-red-500/20"
                        disabled={isAuthLoading}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </GlassmorphismButton>
                    )}
                    {editingEvent && (
                      <GlassmorphismButton
                        variant="outline"
                        onClick={() => window.open(generateGoogleCalendarLink(editingEvent), '_blank')}
                        disabled={isAuthLoading}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Add to Google
                      </GlassmorphismButton>
                    )}
                  </div>
                  
                  <div className="flex space-x-3">
                    <GlassmorphismButton variant="outline" onClick={resetEventDialog} disabled={isAuthLoading}>
                      Cancel
                    </GlassmorphismButton>
                    <GlassmorphismButton 
                      onClick={saveEvent}
                      disabled={!newEvent.title || isSavingEvent || isAuthLoading}
                      className="bg-gradient-to-r from-blue-500 to-green-500"
                    >
                      {isSavingEvent ? 'Saving...' : (editingEvent ? 'Update Event' : 'Create Event')}
                    </GlassmorphismButton>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Task Dialog */}
        <Dialog open={!!editingTask} onOpenChange={open => { if (!open) setEditingTask(null); }}>
          <DialogContent className="max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-white/20">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white">Edit Task</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 mt-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Task Title
                </label>
                <Input
                  value={editTaskData.title}
                  onChange={e => setEditTaskData({ ...editTaskData, title: e.target.value })}
                  placeholder="Enter task title..."
                  className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Priority
                </label>
                <Select 
                  value={editTaskData.priority} 
                  onValueChange={(value: 'low' | 'medium' | 'high') => setEditTaskData({ ...editTaskData, priority: value })}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                    <SelectItem value="low">Low Priority</SelectItem>
                    <SelectItem value="medium">Medium Priority</SelectItem>
                    <SelectItem value="high">High Priority</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <GlassmorphismButton variant="outline" onClick={() => setEditingTask(null)}>
                  Cancel
                </GlassmorphismButton>
                <GlassmorphismButton 
                  onClick={saveEditTask}
                  disabled={!editTaskData.title.trim()}
                  className="bg-gradient-to-r from-blue-500 to-green-500"
                >
                  Save
                </GlassmorphismButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </CalendarErrorBoundary>
  );
};

export default SmartCalendar;
