import React from 'react';
import { Theme, ReservationData } from '../types';
import { Check, X, Calendar, Clock, Users, Mail, Phone, MessageSquare } from 'lucide-react';

interface EmailViewProps {
  theme: Theme;
}

const data: ReservationData = {
  name: 'Kovács Anna',
  date: '2023. október 24.',
  time: '19:30',
  guests: 4,
  email: 'anna.kovacs@example.com',
  phone: '+36 30 123 4567',
  notes: 'Ablak melletti asztalt szeretnénk.',
};

export const EmailView: React.FC<EmailViewProps> = ({ theme }) => {
  const s = theme.styles;

  return (
    <div
      className={`p-8 ${s.glassContainer} ${s.radius} bg-white/40 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(16,185,129,0.05)] rounded-2xl max-w-xl mx-auto relative overflow-hidden`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-white/10 to-emerald-50/40 pointer-events-none" />

      {/* Intro Block */}
      <div className="mb-8 relative z-10 space-y-3">
        <h1 className={`text-2xl ${s.headingFont} ${s.headingColor}`}>Foglalás megerősítésre vár</h1>
        <p className={`leading-relaxed ${s.textColor} ${s.bodyFont}`}>
          Kedves Admin!
          <br />
          <br />
          Új asztalfoglalás érkezett. Kérjük, tekintse át a részleteket.
        </p>
        <div className={`border-b ${s.divider}`} />
      </div>

      {/* Summary Card */}
      <div className={`${s.glassPanel} ${s.radius} p-6 relative z-10 bg-white/60 backdrop-blur-lg border border-white/60 shadow-inner space-y-6`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs uppercase tracking-wider font-semibold ${s.mutedColor}`}>Foglalási adatok</span>
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-yellow-100/70 text-yellow-800 border border-yellow-200/70 backdrop-blur-sm">
            Függőben
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <DetailRow icon={<Users size={16} />} label="Név" value={data.name} theme={theme} highlight />
            <DetailRow icon={<Users size={16} />} label="Létszám" value={`${data.guests} fő`} theme={theme} />
          </div>
          <div className="space-y-4">
            <DetailRow icon={<Calendar size={16} />} label="Dátum" value={data.date} theme={theme} />
            <DetailRow icon={<Clock size={16} />} label="Időpont" value={data.time} theme={theme} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <DetailRow icon={<Mail size={16} />} label="Email" value={data.email} theme={theme} />
          <DetailRow icon={<Phone size={16} />} label="Telefon" value={data.phone} theme={theme} />
          {data.notes && <DetailRow icon={<MessageSquare size={16} />} label="Megjegyzés" value={data.notes} theme={theme} />}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 ${s.buttonPrimary}`}>
            <Check size={18} />
            Elfogadás
          </button>
          <button className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 ${s.buttonSecondary}`}>
            <X size={18} />
            Elutasítás
          </button>
        </div>
      </div>
    </div>
  );
};

const DetailRow = ({ icon, label, value, theme, highlight }: any) => {
  const s = theme.styles;
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 shrink-0 rounded-full bg-white/50 backdrop-blur p-2 ${s.accentColor}`}>{icon}</div>
      <div>
        <p className={`text-xs mb-0.5 ${s.mutedColor}`}>{label}</p>
        <p className={`${highlight ? 'text-lg font-semibold' : 'text-base font-medium'} ${s.headingColor} ${s.headingFont}`}>
          {value}
        </p>
      </div>
    </div>
  );
};
