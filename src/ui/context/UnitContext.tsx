import React, { createContext, useState, useContext, useMemo, ReactNode, FC, useEffect, useCallback } from 'react';
import { User, Unit } from '../../core/models/data';

interface UnitContextType {
  allUnits: Unit[];
  selectedUnits: string[];
  setSelectedUnits: React.Dispatch<React.SetStateAction<string[]>>;
}

const UnitContext = createContext<UnitContextType | undefined>(undefined);

interface UnitProviderProps {
  children: ReactNode;
  currentUser: User | null; // Can be null during loading
  allUnits: Unit[];
}

export const UnitProvider: FC<UnitProviderProps> = ({ children, currentUser, allUnits }) => {
  
  const storageKey = useMemo(() => 
    currentUser ? `mintleaf_selected_units_${currentUser.id}` : null
  , [currentUser]);

  const getInitialSelection = useCallback((): string[] => {
    // 1. Try to load from localStorage first
    if (storageKey) {
        try {
            const savedState = localStorage.getItem(storageKey);
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                if (Array.isArray(parsedState) && parsedState.every(item => typeof item === 'string')) {
                    return parsedState;
                }
            }
        } catch (e) {
            console.error("Failed to parse selected units from localStorage", e);
        }
    }
    
    // 2. Fallback to default logic
    if (!currentUser) return [];
    
    if (currentUser.role === 'Admin') {
      return allUnits.map(unit => unit.id);
    }
    return currentUser.unitIds || [];
  }, [currentUser, allUnits, storageKey]);

  const [selectedUnits, setSelectedUnits] = useState<string[]>(getInitialSelection);

  // Re-initialize state if user changes or if allUnits loads after user.
  useEffect(() => {
      if (currentUser) {
          setSelectedUnits(getInitialSelection());
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, allUnits]); // getInitialSelection is memoized and safe here

  // Save changes to localStorage
  useEffect(() => {
    if (storageKey) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(selectedUnits));
        } catch (e) {
            console.error("Failed to save selected units to localStorage", e);
        }
    }
  }, [selectedUnits, storageKey]);


  // Memoize the context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    allUnits,
    selectedUnits,
    setSelectedUnits,
  }), [allUnits, selectedUnits]);

  return (
    <UnitContext.Provider value={value}>
      {children}
    </UnitContext.Provider>
  );
};

// Custom hook for easier consumption of the context
export const useUnitContext = () => {
  const context = useContext(UnitContext);
  if (context === undefined) {
    throw new Error('useUnitContext must be used within a UnitProvider');
  }
  return context;
};
