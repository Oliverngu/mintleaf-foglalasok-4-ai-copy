// Csak a releváns részek (Interface és Return)
// A logikát (data fetching) hagyd meg, azzal nincs baj.

interface HomeDashboardProps {
  // ... data props ...
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  activeUnit: Unit | null;
  useBrandTheme: boolean;
  onBrandChange: (enabled: boolean) => void;
  themeBases: ThemeBases;
  onThemeBasesChange: (bases: ThemeBases) => void;
}

const HomeDashboard: React.FC<HomeDashboardProps> = ({
  // ... props ...
  themeMode, onThemeChange, activeUnit, useBrandTheme, onBrandChange, themeBases, onThemeBasesChange, currentUser
}) => {
  
  const isGlobalAdmin = currentUser?.role === 'Admin';
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  return (
    <div className="p-4 md:p-8">
        {/* HEADER */}
        <div 
            className="rounded-2xl p-6 mb-8 text-white shadow-lg relative overflow-hidden transition-all duration-300"
            style={{
                backgroundColor: 'var(--color-header-bg)', 
                backgroundImage: 'var(--ui-header-image)',
                backgroundBlendMode: 'var(--ui-header-blend-mode)',
                backgroundSize: 'cover', backgroundPosition: 'center',
                color: 'var(--color-text-on-primary)'
            }}
        >
            <div className="absolute inset-0 bg-black/10 pointer-events-none" />
            <div className="relative z-10 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Üdv, {currentUser.firstName}!</h1>
                </div>
                <div className="flex items-center gap-3">
                    <ThemeSelector 
                        activeUnit={activeUnit} 
                        currentTheme={themeMode}
                        onThemeChange={onThemeChange} 
                        useBrandTheme={useBrandTheme} 
                        onBrandChange={onBrandChange} 
                    />
                    
                    {isGlobalAdmin && (
                        <button onClick={() => setShowThemeEditor(!showThemeEditor)} className="bg-white/20 p-2 rounded-lg">Editor</button>
                    )}
                    <button onClick={() => setIsEditMode(!isEditMode)} className="bg-white/20 p-2 rounded-lg"><PencilIcon/></button>
                </div>
            </div>
        </div>

        {/* ADMIN EDITOR */}
        {isGlobalAdmin && showThemeEditor && (
            <div className="mb-6">
                <AdminThemeEditor bases={themeBases} onChangeBases={onThemeBasesChange} onClose={() => setShowThemeEditor(false)} />
            </div>
        )}

        {/* WIDGETEK */}
        {/* ... (Widget Grid kódja változatlan) ... */}
    </div>
  );
};
export default HomeDashboard;
