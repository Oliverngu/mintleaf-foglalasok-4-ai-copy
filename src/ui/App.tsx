const ThemeManagerBridge: React.FC<{ 
  allUnits: Unit[]; 
  bases: ThemeBases; 
  themeMode: ThemeMode; 
  useBrandTheme: boolean; 
}> = ({
  allUnits,
  bases,
  themeMode,
  useBrandTheme, 
}) => {
  const { selectedUnits } = useUnitContext();
  const activeUnit = selectedUnits.length
    ? allUnits.find(u => u.id === selectedUnits[0]) || null
    : null;

  // JAVÍTÁS: A propok neveit szinkronba hoztuk a ThemeManager elvárásaival
  return (
    <ThemeManager 
      activeUnit={activeUnit} 
      themeMode={themeMode}        // Korábban: mode={themeMode} -> HIBA
      useBrandTheme={useBrandTheme} // Korábban: brandMode={useBrandTheme} -> HIBA
      adminConfig={bases}          // Korábban: bases={bases} -> HIBA (ezért nem volt admin téma)
    />
  );
};
