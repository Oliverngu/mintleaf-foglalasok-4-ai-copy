import React, { useState } from 'react';
import { Theme } from '../types';
import { ChevronRight, Check, ChevronLeft, CalendarPlus } from 'lucide-react';

export const WizardBooking: React.FC<{ theme: Theme }> = ({ theme }) => {
  const [step, setStep] = useState(1);
  const s = theme.styles;

  const nextStep = () => setStep((prev) => Math.min(prev + 1, 3));
  const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

  return (
    <div
      className={`w-full max-w-4xl mx-auto ${s.glassContainer} ${s.radius} bg-white/40 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(16,185,129,0.05)] p-8 min-h-[600px] flex flex-col`}
    >
      {/* Steps Indicator */}
      <div className="mb-10 text-center space-y-4">
        <h2 className={`text-3xl ${s.headingFont} ${s.headingColor}`}>Asztalfoglalás</h2>
        <div className="flex items-center justify-center gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-500 border ${
                  step >= i
                    ? `${s.accentBg} text-white shadow-lg border-transparent`
                    : 'bg-white/30 text-gray-400 border-white/60 backdrop-blur'
                }`}
              >
                {step > i ? <Check size={16} /> : i}
              </div>
              {i < 3 && <div className={`w-12 h-0.5 mx-2 ${step > i ? 'bg-current opacity-50' : 'bg-gray-200/40'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 text-center flex-1 flex flex-col items-center justify-center space-y-8">
            <div className="space-y-4">
              <h3 className={`text-xl font-semibold ${s.headingColor}`}>Válasszon dátumot</h3>
              {/* Calendar UI Mockup */}
              <div className="grid grid-cols-7 gap-2 max-w-sm mx-auto">
                {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                  <button
                    key={d}
                    className={`aspect-square rounded-full hover:bg-white/60 transition ${s.textColor} border border-white/50 backdrop-blur`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={nextStep} className={`px-8 py-3 inline-flex items-center gap-2 ${s.buttonPrimary}`}>
              Tovább <ChevronRight size={18} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex-1 min-h-0 flex flex-col">
            <div className="max-w-md mx-auto flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto space-y-4 p-1 sm:p-2">
                <input className={`w-full px-4 py-3 ${s.input}`} placeholder="Név" />
                <input className={`w-full px-4 py-3 ${s.input}`} placeholder="Email" />
              </div>
              <div className="flex justify-between gap-3 pt-6">
                <button onClick={prevStep} className={`px-6 py-3 flex items-center gap-2 ${s.buttonSecondary}`}>
                  <ChevronLeft size={18} /> Vissza
                </button>
                <button onClick={nextStep} className={`px-8 py-3 flex items-center gap-2 ${s.buttonPrimary}`}>
                  Tovább <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center animate-in fade-in zoom-in-95 flex-1 flex flex-col items-center justify-center space-y-8">
            <div className={`${s.glassPanel} ${s.radius} p-8 bg-white/60 backdrop-blur-lg shadow-inner border border-white/60 w-full max-w-md`}>
              <h3 className={`text-xl mb-2 ${s.headingColor}`}>Foglalás Összesítése</h3>
              <p className={`${s.textColor} text-lg font-medium`}>Október 24. | 19:30</p>
            </div>
            <button className={`w-full max-w-md py-4 flex justify-center items-center gap-2 ${s.buttonPrimary}`}>
              <CalendarPlus /> Véglegesítés
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
