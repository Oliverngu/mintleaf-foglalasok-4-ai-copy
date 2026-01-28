/**
 * schedulerDashStyle.ts
 * Design system tokens for the BeosztasKeszitoApp.
 */

export const DASH_STYLE = {
  // Layout
  root: "flex flex-col h-screen w-screen bg-slate-50 text-slate-900 font-sans overflow-hidden",
  layoutWrapper: "flex flex-1 overflow-hidden relative pb-[72px] md:pb-0",
  mainArea: "flex-1 flex flex-col min-w-0 overflow-hidden",

  // Top Toolbar
  toolbar: {
    container: "h-14 md:h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between shadow-sm z-30",
    identity: "flex items-center gap-3",
    logo: "w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-black text-xl",
    title: "text-lg font-black text-slate-800 tracking-tight hidden sm:block",
    viewSpanWrapper: "flex bg-slate-100 p-1 rounded-xl border border-slate-200",
    viewBtn: (active: boolean) => `px-2 md:px-4 py-1.5 text-[10px] md:text-sm font-bold rounded-lg transition-all ${
      active ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'
    }`,
    actions: "flex items-center gap-2 md:gap-4",
    btnSecondary: "p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors hidden md:flex items-center gap-2",
    btnPrimary: "bg-emerald-600 hover:bg-emerald-700 text-white px-3 md:px-5 py-2 rounded-lg font-bold text-xs md:text-sm transition-all shadow-sm active:scale-95",
    modeToggle: (edit: boolean) => `hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
      edit ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-600'
    }`
  },

  // Schedule Table
  table: {
    container: "flex-1 overflow-auto relative bg-white",
    wrapper: "inline-block min-w-full border-separate border-spacing-0",
    headerRow: "sticky top-0 z-20 bg-slate-50/95 backdrop-blur-sm",
    headerCell: "px-4 py-3 border-b border-r border-slate-200 text-left text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest sticky top-0 bg-inherit",
    employeeColumn: "sticky left-0 z-10 bg-white border-r border-slate-200 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.05)]",
    
    row: "hover:bg-slate-50/20 transition-colors group",
    employeeCell: "p-3 md:p-4 border-b border-slate-200 cursor-pointer min-w-[160px] md:min-w-[260px]",
    avatar: "w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-200 border-2 border-white object-cover shadow-sm",
    empName: "text-xs md:text-sm font-bold text-slate-800 truncate",
    empRole: "text-[9px] md:text-xs text-slate-400 font-medium truncate",
    
    cell: "p-1 md:p-2 border-b border-r border-slate-200 min-w-[100px] md:min-w-[150px] h-16 md:h-24 transition-all",
    
    shift: {
      base: "w-full h-full rounded-xl p-1.5 md:p-3 flex flex-col justify-between text-left text-[9px] md:text-xs shadow-sm border transition-transform",
      normal: "bg-white border-slate-200 text-slate-700",
      suggested: "bg-emerald-50 border-2 border-dashed border-emerald-300 text-emerald-800",
      violation: "bg-rose-50 border-rose-200 text-rose-800",
      off: "w-full h-full flex items-center justify-center text-slate-300 bg-slate-50/50 rounded-xl border border-slate-100 border-dashed",
      empty: (editing: boolean) => `w-full h-full rounded-xl flex items-center justify-center ${
        editing ? 'hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 border-dashed cursor-pointer' : 'bg-transparent'
      }`,
      badge: "inline-flex px-1.5 md:px-2 py-0.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest",
      dot: "w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-rose-500 animate-pulse"
    },
    timeRange: "font-mono font-bold block mb-0.5 md:mb-1 truncate",
    posName: "text-[8px] md:text-[10px] font-black uppercase tracking-tighter opacity-60 truncate"
  },

  // Panels & Mobile UI
  panel: {
    container: "hidden lg:flex w-80 h-full bg-white border-l border-slate-200 flex-col shadow-[-4px_0_15px_-5px_rgba(0,0,0,0.03)] z-10",
    header: "p-5 border-b border-slate-100 font-black text-[10px] uppercase tracking-[0.2em] text-slate-400",
    content: "flex-1 overflow-y-auto p-5",
    scoreCard: "bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl mb-6",
    scoreLabel: "text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1",
    scoreValue: "text-3xl font-black",
    
    item: "p-4 rounded-2xl mb-3 border border-slate-100 shadow-sm bg-white hover:border-emerald-200 transition-colors",
    itemTitle: "font-black text-[10px] uppercase tracking-tighter mb-1",
    itemDesc: "text-xs text-slate-500 leading-relaxed",
    
    mobileDock: "fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 pb-safe flex items-center justify-between shadow-[0_-8px_30px_-10px_rgba(0,0,0,0.15)] z-40 md:hidden",
    mobileDockBtn: "bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-emerald-200",
    mobileDockSecondary: "p-3 bg-slate-100 rounded-xl text-slate-500 active:bg-slate-200 transition-colors",
    
    mobileDrawerOverlay: "fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[45] animate-in fade-in duration-300",
    mobileDrawer: "fixed bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] shadow-2xl z-50 max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-400",
    drawerHandle: "w-12 h-1.5 bg-slate-200 rounded-full mx-auto my-4 flex-shrink-0"
  },

  // Profile Modal
  profile: {
    overlay: "fixed inset-0 z-[100] flex items-center justify-center p-4",
    backdrop: "absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]",
    modal: "bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative animate-in zoom-in duration-300",
    avatar: "w-24 h-24 rounded-[2rem] mx-auto mb-4 shadow-lg border-4 border-white object-cover",
    name: "text-center text-2xl font-black text-slate-800",
    role: "text-center text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mb-6",
    insight: "bg-emerald-50 p-5 rounded-2xl text-emerald-800 text-xs italic leading-relaxed",
    closeBtn: "w-full mt-6 bg-slate-900 text-white py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-transform"
  }
};

export const getBadgeColor = (pos: string) => {
  const map: Record<string, string> = {
    Bar: "bg-emerald-100 text-emerald-700",
    Kitchen: "bg-orange-100 text-orange-700",
    Floor: "bg-blue-100 text-blue-700",
    Service: "bg-purple-100 text-purple-700"
  };
  return map[pos] || "bg-slate-100 text-slate-700";
};