import { Shift, User, Request, Unit, ScheduleSettings, ExportStyleSettings } from '../../../core/models/data';

// Make sure SheetJS is loaded from index.html
declare const XLSX: any;

interface ExcelExportParams {
  users: User[];
  weekDays: Date[];
  shiftsByUserDay: Map<string, Map<string, Shift[]>>;
  requestsByUserDay: Map<string, Set<string>>;
  toDateString: (date: Date) => string;
  units: Unit[];
  currentUser: User;
  weekSettings: ScheduleSettings | null;
  exportSettings: ExportStyleSettings;
}

const adjustColor = (hex: string, percent: number): string => {
    if (!hex || hex.length < 7) return '#FFFFFF';
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);

    const amount = Math.round(2.55 * percent);

    r = Math.min(255, Math.max(0, r + amount));
    g = Math.min(255, Math.max(0, g + amount));
    b = Math.min(255, Math.max(0, b + amount));

    const toHex = (c: number) => Math.round(c).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// --- COLOR HELPER FUNCTIONS ---
const hexToRgb = (hex: string): { r: number, g: number, b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
};

const getContrastingTextColor = (hex: string): '#FFFFFF' | '#000000' => {
    if (!hex) return '#000000';
    const rgb = hexToRgb(hex);
    if (!rgb) return '#000000';
    const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#FFFFFF';
};


export const generateExcelExport = async ({
  users,
  weekDays,
  shiftsByUserDay,
  requestsByUserDay,
  toDateString,
  units,
  currentUser,
  weekSettings,
  exportSettings,
}: ExcelExportParams): Promise<void> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
        try {
            const unitName = units.find(u => u.id === currentUser.unitIds?.[0])?.name || 'Ismeretlen Egység';
            const monthName = weekDays[0].toLocaleDateString('hu-HU', { month: 'long' });
            
            const usersByPosition = users.reduce((acc, user) => {
                const pos = user.position || 'Nincs pozíció';
                if (!acc[pos]) acc[pos] = [];
                acc[pos].push(user);
                return acc;
            }, {} as Record<string, User[]>);

            const data: (string | number | null)[][] = [];
            // Header rows
            data.push([monthName.charAt(0).toUpperCase() + monthName.slice(1), unitName, null, null, null, null, null, null]);
            data.push([]); 

            const dayHeader: (string|null)[] = ['Munkatárs'];
            const dayNames = exportSettings.useFullNameForDays 
                ? ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']
                : ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
            weekDays.forEach((day, index) => {
                dayHeader.push(`${dayNames[index]}\n${day.toLocaleDateString('hu-HU', { month: '2-digit', day: '2-digit' })}`);
            });
            data.push(dayHeader);

            // Optional opening/closing time rows
            if (weekSettings?.showOpeningTime) {
                const openingTimeRow: (string | null)[] = ['Nyitás'];
                weekDays.forEach((_, i) => openingTimeRow.push(weekSettings.dailySettings[i]?.openingTime || ''));
                data.push(openingTimeRow);
            }

            if (weekSettings?.showClosingTime) {
                const closingTimeRow: (string | null)[] = ['Zárás'];
                weekDays.forEach((_, i) => closingTimeRow.push(weekSettings.dailySettings[i]?.closingTime || ''));
                data.push(closingTimeRow);
            }
            
            data.push([]);

            // User data rows, grouped by position
            const sortedPositionKeys = Object.keys(usersByPosition).sort((a,b) => {
                const aIndex = users.findIndex(u => (u.position || 'Nincs pozíció') === a);
                const bIndex = users.findIndex(u => (u.position || 'Nincs pozíció') === b);
                return aIndex - bIndex;
            });
            
            const positionHeaderRowIndices = new Set<number>();

            sortedPositionKeys.forEach(position => {
                positionHeaderRowIndices.add(data.length);
                data.push([position, null, null, null, null, null, null, null]);
                usersByPosition[position].forEach(user => {
                    const userRow: (string | number | null)[] = [user.fullName];
                    weekDays.forEach(day => {
                        const dayKey = toDateString(day);
                        const isOnLeave = requestsByUserDay.get(user.id)?.has(dayKey);
                        if (isOnLeave) {
                            userRow.push('SZ');
                        } else {
                            const dayShifts = shiftsByUserDay.get(user.id)?.get(dayKey) || [];
                            const cellText = dayShifts.map(s => {
                                if (s.isDayOff) return 'X';
                                const start = s.start.toDate().toTimeString().substring(0, 5);
                                const end = s.end ? ` - ${s.end.toDate().toTimeString().substring(0, 5)}` : '';
                                return `${start}${end}`;
                            }).join('\n') || null;
                            userRow.push(cellText);
                        }
                    });
                    data.push(userRow);
                });
                data.push([]);
            });

            const ws = XLSX.utils.aoa_to_sheet(data);
            
            const colWidths = Array.from({ length: 8 }, (_, colIndex) => {
                let maxLength = 0;
                data.forEach(row => {
                    const cellContent = row[colIndex];
                    if (cellContent) {
                        const lines = String(cellContent).split('\n');
                        lines.forEach(line => {
                            if (line.length > maxLength) maxLength = line.length;
                        });
                    }
                });
                if (colIndex === 0) return { wch: Math.min(25, Math.max(20, maxLength + 2)) };
                return { wch: Math.max(15, maxLength + 2) };
            });
            ws['!cols'] = colWidths;
            
            const rowHeights = data.map((row, rowIndex) => {
                if (!row.some(cell => cell)) return { hpt: 10 }; 
                let maxLines = 1;
                row.forEach(cellContent => {
                    if (cellContent) {
                        const lines = String(cellContent).split('\n').length;
                        if (lines > maxLines) maxLines = lines;
                    }
                });
                if (positionHeaderRowIndices.has(rowIndex)) return { hpt: 24 };
                if (rowIndex === 2) return { hpt: 35 };
                return { hpt: Math.max(25, 18 * maxLines) }; 
            });
            ws['!rows'] = rowHeights;
            
            const merges = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 7 } }];
            positionHeaderRowIndices.forEach(rowIndex => {
                merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: 7 } });
            });
            ws['!merges'] = merges;

            // --- Cell styling ---
            const toARGB = (hex: string) => 'FF' + hex.substring(1).toUpperCase();
            const gridColorARGB = toARGB(exportSettings.gridColor).substring(2);

            const rowTypes = data.map((row, r) => {
                if (positionHeaderRowIndices.has(r)) return 'category';
                if (r === 2) return 'dayHeader';
                if (r < 3 || !row[0]) return 'spacer';
                if (String(row[0]).startsWith('Nyitás') || String(row[0]).startsWith('Zárás')) return 'info';
                return 'user';
            });

            let userRowIndex = 0;
            data.forEach((row, r) => {
                const rowType = rowTypes[r];
                if (rowType === 'category') userRowIndex = 0;
                if (rowType === 'user') userRowIndex++;

                row.forEach((cellValue, c) => {
                    const cellAddress = XLSX.utils.encode_cell({r, c});
                    if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };
                    
                    const isEven = userRowIndex % 2 === 0;

                    const style: any = {
                        font: { sz: exportSettings.fontSizeCell },
                        alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
                        border: { 
                            top: { style: "thin", color: { rgb: gridColorARGB } },
                            bottom: { style: "thin", color: { rgb: gridColorARGB } },
                            left: { style: "thin", color: { rgb: gridColorARGB } },
                            right: { style: "thin", color: { rgb: gridColorARGB } }
                        }
                    };
                    
                    const calculatedCategoryTextColor = getContrastingTextColor(exportSettings.categoryHeaderBgColor);
                    
                    let bgColorHex = '#FFFFFF';

                    if (rowType === 'category') {
                        bgColorHex = exportSettings.categoryHeaderBgColor;
                        style.font = { sz: exportSettings.fontSizeHeader + 2, bold: true, color: { rgb: toARGB(calculatedCategoryTextColor).substring(2) } };
                        style.fill = { fgColor: { rgb: toARGB(bgColorHex) } };
                    } else if (rowType === 'dayHeader') {
                        bgColorHex = c === 0 ? exportSettings.nameColumnColor : exportSettings.dayHeaderBgColor;
                        style.font = { sz: exportSettings.fontSizeHeader, bold: true, color: { rgb: toARGB(getContrastingTextColor(bgColorHex)).substring(2) } };
                        style.fill = { fgColor: { rgb: toARGB(bgColorHex) } };
                    } else if (rowType === 'info') {
                        bgColorHex = exportSettings.dayHeaderBgColor;
                        style.font = { sz: exportSettings.fontSizeCell, bold: true, color: { rgb: toARGB(getContrastingTextColor(bgColorHex)).substring(2) } };
                        style.fill = { fgColor: { rgb: toARGB(bgColorHex) } };
                    } else if (rowType === 'user') {
                        const altZebraColor = adjustColor(exportSettings.zebraColor, -(exportSettings.zebraStrength / 2));
                        const altNameColor = adjustColor(exportSettings.nameColumnColor, -(exportSettings.zebraStrength / 2));
                        
                        bgColorHex = c === 0 
                            ? (isEven ? altNameColor : exportSettings.nameColumnColor)
                            : (isEven ? altZebraColor : exportSettings.zebraColor);
                        
                        style.fill = { fgColor: { rgb: toARGB(bgColorHex) } };
                        style.font.color = { rgb: toARGB(getContrastingTextColor(bgColorHex)).substring(2) };
                        if (c === 0) style.font.bold = true;
                    }

                    if (cellValue === 'SZ') {
                        style.font.bold = true;
                        style.font.color = { rgb: "9C0006" }; // Darker red
                        style.fill = { fgColor: { rgb: "FFC7CE" } }; // Light red
                    }

                    if (cellValue === 'X') {
                        style.font.sz = exportSettings.fontSizeCell;
                        style.font.bold = true;
                    }
                    
                    ws[cellAddress].s = style;
                });
            });


            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Beosztás');
            const weekStart = weekDays[0].toLocaleDateString('hu-HU', { year: 'numeric', month:'2-digit', day:'2-digit' }).replace(/\.\s/g, '-').replace('.','');
            XLSX.writeFile(wb, `beosztas_${weekStart}.xlsx`);
            resolve();
        } catch (err) {
            console.error("Export failed:", err);
            alert("Hiba történt az exportálás során.");
            reject(err);
        }
    }, 0);
  });
};
