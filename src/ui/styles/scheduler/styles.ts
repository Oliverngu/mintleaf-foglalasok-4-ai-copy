/**
 * BeosztasKeszitoApp (MintLeaf Scheduler)
 * Production DASH Style Specification - MOBILE FIRST REFINEMENT
 */

export const DASH_STYLE = {
  // Layout Roots
  root: "flex flex-col h-screen w-screen bg-slate-50 text-slate-900 font-sans overflow-hidden",
  layoutWrapper: "flex flex-1 overflow-hidden relative pb-[72px] lg:pb-0", // Space for mobile dock
  mainArea: "flex-1 flex flex-col min-w-0 overflow-hidden",

  // Top Toolbar
  toolbar: {
    container: "h-14 lg:h-16 bg-white border-b border-slate-200 px-3 lg:px-6 flex items-center justify-between shadow-sm z-30",
    identity: "flex items-center gap-2 lg:gap-3",
    logo: "w-7 h-7 lg:w-9 lg:h-9 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-sm lg:text-lg",
    appName: "text-base lg:text-xl font-black text-slate-800 tracking-tight",
    viewSelector: "hidden sm:flex bg-slate-100 p-1 rounded-lg border border-slate-200",
    viewBtn: (active: boolean) => `px-3 lg:px-4 py-1.5 text-xs lg:text-sm font-semibold rounded-md transition-all ${active ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`,
    actions: "flex items-center gap-2 lg:gap-4",
    editToggle: (on: boolean) => `hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${on ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-600'}`,
    userCircle: "w-8 h-8 lg:w-9 lg:h-9 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-500 font-bold text-xs"
  },

  // Scheduling Table
  table: {
    container: "flex-1 overflow-auto relative bg-white scroll-smooth",
    scrollHint: "absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/80 to-transparent pointer-events-none z-[15] lg:hidden",
    wrapper: "inline-block min-w-full border-separate border-spacing-0",
    headerRow: "sticky top-0 z-20 bg-slate-50/95 backdrop-blur-sm",
    headerCell: "px-3 lg:px-6 py-2 lg:py-4 border-b border-r border-slate-200 text-left text-[10px] lg:text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 bg-inherit",
    employeeColumn: "sticky left-0 z-10 bg-white border-r border-slate-200 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)] lg:shadow-none",
    
    row: "hover:bg-slate-50/50 transition-colors group",
    employeeCell: "p-2 lg:p-4 border-b border-slate-200 cursor-pointer min-w-[140px] lg:min-w-[280px]",
    avatar: "w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-slate-200 border-2 border-white flex-shrink-0 object-cover",
    empName: "text-xs lg:text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition-colors truncate",
    empRole: "text-[9px] lg:text-xs text-slate-400 font-medium truncate",
    
    cell: "p-1 lg:p-2 border-b border-r border-slate-200 min-w-[110px] lg:min-w-[160px] h-16 lg:h-24 transition-all",
    
    shift: {
      base: "w-full h-full rounded-lg p-1.5 lg:p-3 flex flex-col justify-between text-left text-[10px] lg:text-xs shadow-sm border overflow-hidden",
      normal: "bg-white border-slate-200 text-slate-700",
      suggested: "bg-amber-50 border-2 border-dashed border-amber-300 text-amber-800 animate-pulse",
      violation: "bg-rose-50 border-rose-200 text-rose-800",
      off: "w-full h-full flex items-center justify-center text-slate-300 bg-slate-50/50 rounded-lg border border-slate-100",
      empty: (editing: boolean) => `w-full h-full rounded-lg transition-colors flex items-center justify-center ${editing ? 'hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 border-dashed cursor-pointer' : 'bg-transparent'}`,
      badge: "inline-flex px-1 lg:px-2 py-0.5 rounded text-[8px] lg:text-[10px] font-black uppercase tracking-widest"
    },
    timeRange: "font-mono font-bold block mb-0.5 lg:mb-1",
    positionName: "text-[9px] lg:text-[11px] opacity-60 font-semibold uppercase tracking-tighter"
  },

  // Mobile Dock & Panel
  panel: {
    container: "hidden lg:flex w-80 h-full bg-white border-l border-slate-200 flex-col shadow-[-4px_0_10px_-5px_rgba(0,0,0,0.03)] z-10",
    
    mobileDock: "fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 pb-safe-offset-4 flex items-center justify-between shadow-[0_-8px_30px_-10px_rgba(0,0,0,0.15)] z-40 lg:hidden",
    mobileDockStatus: "flex flex-col",
    mobileDockLabel: "text-[9px] font-black text-slate-400 uppercase tracking-widest",
    mobileDockValue: "text-xs font-bold text-emerald-600 flex items-center gap-1",
    mobileDockButton: "bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all shadow-lg shadow-emerald-200",
    
    mobileDrawerOverlay: "fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 lg:hidden animate-in fade-in duration-300",
    mobileDrawer: "fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] shadow-2xl z-50 max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-400 lg:hidden",
    drawerHandle: "w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-4 mb-2 flex-shrink-0",
    
    header: "p-4 lg:p-6 border-b border-slate-100 bg-white",
    title: "text-sm lg:text-base font-black text-slate-800 flex items-center gap-2",
    section: "flex flex-col flex-1 overflow-y-auto",
    scoreCard: "m-4 lg:m-6 p-5 lg:p-6 rounded-3xl bg-slate-900 text-white shadow-xl",
    scoreValue: "text-3xl lg:text-4xl font-black",
    scoreLabel: "text-[10px] lg:text-xs font-bold text-slate-400 uppercase tracking-widest",
    
    group: "px-4 lg:px-6 py-4 border-b border-slate-50 last:border-b-0",
    groupTitle: "text-[10px] lg:text-xs font-black text-slate-300 uppercase tracking-widest mb-4 flex justify-between",
    
    violation: (severity: 'high' | 'medium') => `p-4 rounded-xl mb-3 text-[11px] lg:text-xs flex flex-col gap-1 border-l-4 ${severity === 'high' ? 'bg-rose-50 border-rose-500 text-rose-900' : 'bg-amber-50 border-amber-500 text-amber-900'} shadow-sm`,
    suggestion: "p-4 rounded-xl mb-3 bg-slate-50 border border-slate-100 text-[11px] lg:text-xs flex flex-col gap-3 hover:border-emerald-200 transition-colors shadow-sm",
    btnApply: "w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg transition-all text-[10px] lg:text-xs uppercase tracking-widest",
    btnUndo: "text-[9px] lg:text-[10px] font-black text-slate-400 uppercase hover:text-slate-600 text-center block w-full mt-2"
  },

  // Adaptive Profile Modal
  profile: {
    overlay: "fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[100] flex items-end lg:items-center justify-center p-0 lg:p-6",
    modal: "bg-white w-full lg:max-w-xl h-[94vh] lg:h-auto rounded-t-[32px] lg:rounded-[32px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom lg:zoom-in duration-300",
    header: "h-32 lg:h-40 bg-slate-100 relative",
    avatarWrapper: "absolute -bottom-12 left-8 p-1.5 bg-white rounded-[24px] shadow-lg",
    avatar: "w-20 h-20 lg:w-28 lg:h-28 rounded-[20px] bg-slate-200 object-cover",
    content: "pt-16 px-8 pb-10 flex-1 overflow-y-auto",
    name: "text-2xl lg:text-3xl font-black text-slate-800",
    role: "text-sm lg:text-base font-semibold text-slate-400 mb-8",
    label: "text-[10px] font-black uppercase text-slate-300 tracking-[0.2em] mb-4 block",
    skillBar: "h-2 bg-slate-100 rounded-full overflow-hidden mb-6",
    insight: "p-5 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-800 text-xs lg:text-sm leading-relaxed italic"
  }
};

export const getBadgeStyle = (type: string) => {
  switch (type.toLowerCase()) {
    case 'bar': return 'bg-emerald-100 text-emerald-700';
    case 'floor': return 'bg-blue-100 text-blue-700';
    case 'kitchen': return 'bg-orange-100 text-orange-700';
    case 'runner': return 'bg-purple-100 text-purple-700';
    default: return 'bg-slate-100 text-slate-600';
  }
};
