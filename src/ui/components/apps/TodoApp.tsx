import React, { useState, useMemo, useEffect } from 'react';
import { Todo, User, Unit } from '../../../core/models/data';
import { db, serverTimestamp, Timestamp } from '../../../core/firebase/config';
import { collection, addDoc, doc, updateDoc, writeBatch, arrayUnion } from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import TodoIcon from '../../../../components/icons/TodoIcon';
import UsersIcon from '../../../../components/icons/UsersIcon';

interface TodoAppProps {
  todos: Todo[];
  loading: boolean;
  error: string | null;
  currentUser: User;
  allUsers: User[];
  allUnits: Unit[];
  activeUnitIds: string[];
}

const SeenByModal: React.FC<{
  todo: Todo;
  allUsers: User[];
  onClose: () => void;
  currentUser: User;
}> = ({ todo, allUsers, onClose, currentUser }) => {
  const { seenByUsers, unseenByUsers } = useMemo(() => {
    if (!todo.unitId) return { seenByUsers: [], unseenByUsers: [] };

    const usersInUnit = allUsers.filter(u => u.unitIds?.includes(todo.unitId) && u.role !== 'Guest');
    const seenIds = new Set(todo.seenBy || []);
    
    const seen = usersInUnit.filter(u => seenIds.has(u.id));
    const unseen = usersInUnit.filter(u => !seenIds.has(u.id));

    return { seenByUsers: seen, unseenByUsers: unseen };
  }, [todo, allUsers]);
  
  const isAdmin = currentUser.role === 'Admin' || currentUser.role === 'Unit Admin';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">Megtekintések</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">&times;</button>
        </div>
        <div className="p-6 max-h-[70vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-bold text-green-700 mb-2">Látták ({seenByUsers.length})</h3>
            <ul className="space-y-2">
              {seenByUsers.map(user => (
                <li key={user.id} className="text-sm">
                  <p className="font-semibold">{`${user.lastName} ${user.firstName}`}</p>
                  <p className="text-xs text-gray-500">
                    {todo.seenAt?.[user.id]?.toDate
                      ? todo.seenAt[user.id].toDate().toLocaleString('hu-HU')
                      : (todo.seenAt?.[user.id] ? 'Feldolgozás alatt...' : 'Ismeretlen időpont')}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          {isAdmin && (
            <div>
              <h3 className="font-bold text-red-700 mb-2">Nem látták még ({unseenByUsers.length})</h3>
              <ul className="space-y-2">
                {unseenByUsers.map(user => (
                  <li key={user.id} className="text-sm font-semibold">{`${user.lastName} ${user.firstName}`}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TodoApp: React.FC<TodoAppProps> = ({ todos, loading, error, currentUser, allUsers, allUnits, activeUnitIds }) => {
  const [newTodoText, setNewTodoText] = useState('');
  const [isDailyNew, setIsDailyNew] = useState(false); // ÚJ: napi teendő jelölés
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [todoToConfirm, setTodoToConfirm] = useState<Todo | null>(null);
  const [viewingSeenBy, setViewingSeenBy] = useState<Todo | null>(null);

  const filteredTodos = useMemo(() => {
    if (currentUser.role === 'Admin' && (!activeUnitIds || activeUnitIds.length === 0)) {
      return todos;
    }
    if (!activeUnitIds || activeUnitIds.length === 0) {
      return todos;
    }
    return todos.filter(t => t.unitId && activeUnitIds.includes(t.unitId));
  }, [todos, activeUnitIds, currentUser.role]);

  // AUTO "LÁTTAM" JELÖLÉS
  useEffect(() => {
    if (!currentUser || loading || filteredTodos.length === 0) return;

    const unseenTodos = filteredTodos.filter(todo => 
      !todo.isDone && 
      (!todo.seenBy || !todo.seenBy.includes(currentUser.id))
    );

    if (unseenTodos.length > 0) {
      const timer = setTimeout(async () => {
        const batch = writeBatch(db);
        unseenTodos.forEach(todo => {
          const todoRef = doc(db, 'todos', todo.id);
          const timestamp = Timestamp.now();
          batch.update(todoRef, {
            seenBy: arrayUnion(currentUser.id),
            [`seenAt.${currentUser.id}`]: timestamp,
          });
        });
        await batch.commit().catch(err => console.error("Failed to mark todos as seen:", err));
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [filteredTodos, currentUser, loading]);

  // ÚJ: NAPI TEENDŐK NAPI RESET
  useEffect(() => {
    if (!filteredTodos.length) return;

    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const dailyToReset = filteredTodos.filter(todo => {
      const t: any = todo;
      if (!t.isDaily) return false;
      if (!todo.isDone) return false;

      const completedDate = t.completedDate as string | undefined;
      if (!completedDate) return true;         // régi adatok -> egyszer reset
      return completedDate !== todayStr;       // ha másik nap, akkor reset
    });

    if (dailyToReset.length === 0) return;

    const run = async () => {
      const batch = writeBatch(db);
      dailyToReset.forEach(todo => {
        const ref = doc(db, 'todos', todo.id);
        batch.update(ref, {
          isDone: false,
          // completedBy/At maradhat, UI csak isDone esetén mutatja
        });
      });

      try {
        await batch.commit();
      } catch (err) {
        console.error('Error resetting daily todos:', err);
      }
    };

    run();
  }, [filteredTodos]);

  // SZÉTVÁLOGATÁS: SIMA vs NAPI TEENDŐK
  const {
    activeTodos,
    completedTodos,
    activeDailyTodos,
    completedDailyTodos,
  } = useMemo(() => {
    const regular = filteredTodos.filter(t => !(t as any).isDaily);
    const daily = filteredTodos.filter(t => (t as any).isDaily);

    const sortActive = (arr: Todo[]) =>
      arr
        .filter(t => !t.isDone)
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

    const sortCompleted = (arr: Todo[]) =>
      arr
        .filter(t => t.isDone)
        .sort((a, b) => (b.completedAt?.toMillis() || 0) - (a.completedAt?.toMillis() || 0));

    return {
      activeTodos: sortActive(regular),
      completedTodos: sortCompleted(regular),
      activeDailyTodos: sortActive(daily),
      completedDailyTodos: sortCompleted(daily),
    };
  }, [filteredTodos]);

  if (currentUser.role === 'Guest') {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold text-red-600">Hozzáférés megtagadva</h2>
        <p className="mt-2 text-gray-600">Vendég felhasználóként nincs jogosultságod a teendők kezeléséhez.</p>
      </div>
    );
  }

  const handleAddNewTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTodoText.trim() === '') return;
    if (activeUnitIds.length === 0) {
      alert("Kérlek, válassz ki egy egységet a fejlécben a teendő hozzáadásához.");
      return;
    }

    setIsSubmitting(true);

    const newTodo: any = {
      text: newTodoText.trim(),
      isDone: false,
      createdBy: currentUser.fullName,
      createdByUid: currentUser.id,
      createdAt: serverTimestamp(),
      seenBy: [currentUser.id],
      seenAt: {
        [currentUser.id]: serverTimestamp()
      },
      unitId: activeUnitIds[0],
      // ÚJ: napi teendő jelölés
      isDaily: isDailyNew || false,
    };

    try {
      await addDoc(collection(db, 'todos'), newTodo);
      setNewTodoText('');
      setIsDailyNew(false);
    } catch (err) {
      console.error("Error adding todo:", err);
      alert("Hiba történt a teendő hozzáadása közben.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleToggleTodo = (todo: Todo) => {
    if (todo.isDone) {
      // Már elvégezve – nem állítjuk vissza
      return;
    }
    setTodoToConfirm(todo);
  };
  
  const handleConfirmComplete = async () => {
    if (!todoToConfirm) return;

    const todoRef = doc(db, 'todos', todoToConfirm.id);
    const isDaily = (todoToConfirm as any).isDaily;
    const todayStr = new Date().toISOString().slice(0, 10);

    setTodoToConfirm(null);

    try {
      const updateData: any = {
        isDone: true,
        completedBy: currentUser.fullName,
        completedAt: serverTimestamp(),
      };

      // ÚJ: napi teendőknél elmentjük, melyik napon lett elvégezve
      if (isDaily) {
        updateData.completedDate = todayStr;
      }

      await updateDoc(todoRef, updateData);
    } catch (err) {
      console.error("Error updating todo:", err);
      alert("Hiba történt a teendő állapotának frissítése közben.");
    }
  };

  const TodoItem: React.FC<{ todo: Todo }> = ({ todo }) => {
    const isNew = !todo.isDone && (!todo.seenBy || !todo.seenBy.includes(currentUser.id));
    const unit = todo.unitId ? allUnits.find(u => u.id === todo.unitId) : null;
    const seenByCount = todo.seenBy?.length || 0;
    const isDaily = (todo as any).isDaily;

    return (
      <div
        className={`relative bg-white p-4 rounded-xl shadow-md border flex items-start gap-4 transition-opacity ${
          todo.isDone ? 'opacity-60' : ''
        }`}
      >
        {isNew && (
          <span
            className="absolute top-4 left-1 w-2.5 h-2.5 bg-blue-500 rounded-full"
            title="Új teendő"
          ></span>
        )}
        <input
          type="checkbox"
          checked={todo.isDone}
          onChange={() => handleToggleTodo(todo)}
          disabled={todo.isDone}
          className="mt-1 h-6 w-6 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-labelledby={`todo-text-${todo.id}`}
        />
        <div className="flex-grow">
          <p
            id={`todo-text-${todo.id}`}
            className={`text-gray-800 ${todo.isDone ? 'line-through text-gray-500' : ''}`}
          >
            {todo.text}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 mt-1">
            <span>
              Létrehozta: <span className="font-semibold">{todo.createdBy}</span>
            </span>
            {todo.createdAt && (
              <span>{todo.createdAt.toDate().toLocaleString('hu-HU')}</span>
            )}
            {unit && (
              <div className="flex items-center gap-1.5 font-semibold text-gray-500">
                {unit.logoUrl ? (
                  <img src={unit.logoUrl} alt="logo" className="w-4 h-4 rounded-sm" />
                ) : (
                  <TodoIcon className="w-4 h-4" />
                )}
                <span>{unit.name}</span>
              </div>
            )}
            {isDaily && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
                Napi
              </span>
            )}
          </div>

          {todo.isDone && todo.completedBy && (
            <p className="text-xs text-green-600 font-semibold mt-0.5">
              Elvégezte: {todo.completedBy}
              {todo.completedAt && ` - ${todo.completedAt.toDate().toLocaleString('hu-HU')}`}
            </p>
          )}
        </div>
        <button
          onClick={() => setViewingSeenBy(todo)}
          className="p-2 text-gray-500 hover:bg-gray-100 rounded-full shrink-0"
        >
          <UsersIcon className="h-5 w-5" />
          <span className="sr-only">Látta: {seenByCount}</span>
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8">
      {viewingSeenBy && (
        <SeenByModal
          todo={viewingSeenBy}
          allUsers={allUsers}
          onClose={() => setViewingSeenBy(null)}
          currentUser={currentUser}
        />
      )}

      {/* ÚJ/SZERKESZTETT FORM: napi checkbox */}
      <form
        onSubmit={handleAddNewTodo}
        className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 mb-8"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-2">Új teendő hozzáadása</h2>
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <input
            type="text"
            value={newTodoText}
            onChange={(e) => setNewTodoText(e.target.value)}
            placeholder="Mit kell tenni?"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition"
            disabled={isSubmitting}
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isDailyNew}
                onChange={(e) => setIsDailyNew(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Napi teendő
            </label>
            <button
              type="submit"
              disabled={isSubmitting || newTodoText.trim() === ''}
              className="bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Mentés...' : 'Hozzáadás'}
            </button>
          </div>
        </div>
      </form>
      
      {loading && (
        <div className="relative h-64">
          <LoadingSpinner />
        </div>
      )}
      {error && (
        <div
          className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-r-lg"
          role="alert"
        >
          <p className="font-bold">Hiba történt</p>
          <p>{error}</p>
        </div>
      )}
      
      {!loading && !error && (
        <div className="space-y-10">
          {/* SIMA TEENDŐK */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Egyszeri teendők</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  Aktuális Feladatok ({activeTodos.length})
                </h3>
                {activeTodos.length > 0 ? (
                  <div className="space-y-4">
                    {activeTodos.map(todo => (
                      <TodoItem key={todo.id} todo={todo} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl">
                    <TodoIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700">
                      Minden feladat elvégezve!
                    </h3>
                    <p className="text-gray-500 mt-1">Nincsenek aktív teendők.</p>
                  </div>
                )}
              </div>
              
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-4">
                  Elvégzett Feladatok ({completedTodos.length})
                </h3>
                {completedTodos.length > 0 ? (
                  <div className="space-y-4">
                    {completedTodos.map(todo => (
                      <TodoItem key={todo.id} todo={todo} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl">
                    <TodoIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700">
                      Nincsenek elvégzett feladatok
                    </h3>
                    <p className="text-gray-500 mt-1">Még egy teendő sem lett kipipálva.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* NAPI TEENDŐK */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Napi teendők</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  Mai teendők ({activeDailyTodos.length})
                </h3>
                {activeDailyTodos.length > 0 ? (
                  <div className="space-y-4">
                    {activeDailyTodos.map(todo => (
                      <TodoItem key={todo.id} todo={todo} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl">
                    <TodoIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700">
                      Minden napi feladat kész!
                    </h3>
                    <p className="text-gray-500 mt-1">Holnap újra nekifuthatsz. 🙃</p>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-4">
                  Ma elvégzett napi teendők ({completedDailyTodos.length})
                </h3>
                {completedDailyTodos.length > 0 ? (
                  <div className="space-y-4">
                    {completedDailyTodos.map(todo => (
                      <TodoItem key={todo.id} todo={todo} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl">
                    <TodoIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700">
                      Ma még nem lett kipipálva napi feladat
                    </h3>
                    <p className="text-gray-500 mt-1">Kezdj egy egyszerűvel, aztán jöhet a többi.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {todoToConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <h2 className="text-xl font-bold text-gray-800">Megerősítés</h2>
            <p className="text-gray-600 my-4">
              Biztosan elvégezted ezt a feladatot? A művelet nem visszavonható.
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setTodoToConfirm(null)}
                className="bg-gray-200 text-gray-800 font-bold py-2 px-6 rounded-lg hover:bg-gray-300"
              >
                Mégse
              </button>
              <button
                onClick={handleConfirmComplete}
                className="bg-green-700 text-white font-bold py-2 px-6 rounded-lg hover:bg-green-800"
              >
                Elvégeztem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TodoApp;