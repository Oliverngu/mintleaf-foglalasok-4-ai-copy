import React from 'react';
import type { EmployeeProfileV1 } from '../../../../core/scheduling/employeeProfiles/types';

const DAY_LABELS = ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat'];

type EmployeeProfilePanelProps = {
  profile: EmployeeProfileV1 | null;
  userName: string;
  positionNameById?: Map<string, string>;
  onClose: () => void;
};

const renderWindows = (windows?: Array<{ startHHmm: string; endHHmm: string }>) => {
  if (!windows || windows.length === 0) return 'Nincs megadva';
  return windows.map(window => `${window.startHHmm}–${window.endHHmm}`).join(', ');
};

export const EmployeeProfilePanel: React.FC<EmployeeProfilePanelProps> = ({
  profile,
  userName,
  positionNameById,
  onClose
}) => {
  return (
    <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Employee profile
          </p>
          <h2 className="text-lg font-semibold text-gray-900">{userName}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          Bezár
        </button>
      </div>

      <div className="space-y-6 px-5 py-4 text-sm text-gray-700">
        <section>
          <h3 className="text-sm font-semibold text-gray-800">Heti elérhetőség</h3>
          {profile ? (
            <div className="mt-2 space-y-1 text-xs text-gray-600">
              {DAY_LABELS.map((label, dayIndex) => {
                const windows = profile.availability.weekly[String(dayIndex)] ?? [];
                return (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <span className="font-medium text-gray-700">{label}</span>
                    <span>{renderWindows(windows)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-500">Nincs profil ehhez a munkatárshoz.</p>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800">Kivételek</h3>
          {profile && profile.availability.exceptions.length > 0 ? (
            <ul className="mt-2 space-y-2 text-xs text-gray-600">
              {profile.availability.exceptions.map((exception, index) => (
                <li
                  key={`${exception.dateKey}-${exception.available}-${index}`}
                  className="rounded-lg bg-gray-50 px-3 py-2"
                >
                  <div className="font-semibold text-gray-700">{exception.dateKey}</div>
                  <div>
                    {exception.available ? 'Elérhető' : 'Nem elérhető'}
                    {exception.available && exception.windows?.length ? ` · ${renderWindows(exception.windows)}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-gray-500">Nincs kivétel megadva.</p>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800">Készségek</h3>
          {profile && Object.keys(profile.skillsByPositionId).length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              {Object.entries(profile.skillsByPositionId).map(([positionId, score]) => (
                <li key={positionId} className="flex items-center justify-between gap-4">
                  <span>{positionNameById?.get(positionId) ?? positionId}</span>
                  <span className="font-semibold">{score}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-gray-500">Nincs készségadat.</p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Limit</h3>
            {profile?.limits ? (
              <ul className="mt-2 space-y-1 text-xs text-gray-600">
                <li>Max óra / hét: {profile.limits.maxHoursPerWeek ?? '—'}</li>
                <li>Max óra / nap: {profile.limits.maxHoursPerDay ?? '—'}</li>
              </ul>
            ) : (
              <p className="mt-2 text-xs text-gray-500">Nincs limit megadva.</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Preferenciák</h3>
            {profile?.preferences ? (
              <ul className="mt-2 space-y-1 text-xs text-gray-600">
                <li>
                  Preferált pozíciók:{' '}
                  {profile.preferences.preferredPositionIds?.length
                    ? profile.preferences.preferredPositionIds
                      .map(id => positionNameById?.get(id) ?? id)
                      .join(', ')
                    : '—'}
                </li>
                <li>Kerüli zárást: {profile.preferences.avoidClose ? 'Igen' : 'Nem'}</li>
              </ul>
            ) : (
              <p className="mt-2 text-xs text-gray-500">Nincs preferencia megadva.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
