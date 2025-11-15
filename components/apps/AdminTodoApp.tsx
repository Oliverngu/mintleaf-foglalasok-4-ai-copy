import React, { useState, useMemo, useEffect } from 'react';
import { Todo, User } from '../../data/mockData';
import { db, serverTimestamp } from '../../firebase/config';
import { collection, addDoc, doc, updateDoc, writeBatch, arrayUnion } from 'firebase/firestore';
import LoadingSpinner from '../LoadingSpinner';
import AdminTodoIcon from '../icons/AdminTodoIcon';

interface AdminTodoAppProps {
  todos: Todo[];
  loading: boolean;
  error: string | null;
  currentUser: User;
}

const AdminTodoApp: React.FC<AdminTodoAppProps> = ({ todos, loading, error, currentUser }) => {
  const [newTodoText, setNewTodoText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [todoToConfirm, setTodoToConfirm] = useState<Todo | null>(null);

  useEffect(() => {
    if (!currentUser || loading || todos.length === 0) return;

    const unseenTodos = todos.filter(todo => 
      !todo.isDone && 
      (!todo.seenBy || !todo.seenBy.includes(currentUser.id))
    );

    if (unseenTodos.length > 0) {
      const timer = setTimeout(async () => {
        const batch = writeBatch(db);
        unseenTodos.forEach(todo => {
          const todoRef = doc(db, 'admin_todos', todo.id);
          batch.update(todoRef, {
            seenBy: arrayUnion(currentUser.id)
          });
        });
        await batch.commit().catch(err => console.error("Failed to mark admin todos as seen:", err));
      }, 2000); 

      return () => clearTimeout(timer);
    }
  }, [todos, currentUser, loading]);


  const handleAddNewTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTodoText.trim() === '') return;

    setIsSubmitting(true);
    const newTodo = {
      text: newTodoText.trim(),
      isDone: false,
      createdBy: currentUser.fullName,
      createdByUid: currentUser.id,
      createdAt: serverTimestamp(),
      seenBy: [currentUser.id],
    };

    try {
      await addDoc(collection(db, 'admin_todos'), newTodo);
      setNewTodoText('');
    } catch (err) {
      console.error("Error adding admin todo:", err);
      alert("Hiba történt a vezetői teendő hozzáadása közben.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleToggleTodo = (todo: Todo) => {
    if (todo.isDone) {
      return;
    }
    setTodoToConfirm(todo);
  };
  
  const handleConfirmComplete = async () => {
    if (!todoToConfirm) return;
    const todoRef = doc(db, 'admin_todos', todoToConfirm.id);
    setTodoToConfirm(null);
    try {
      await updateDoc(todoRef, {
        isDone: true,
        completedBy: currentUser.fullName,
        completedAt: serverTimestamp(),
      });
    } catch (err) {
       console.error("Error updating admin todo:", err);
       alert("Hiba történt a vezetői teendő állapotának frissítése közben.");
    }
  };

  const { activeTodos, completedTodos } = useMemo(() => {
    const active = todos.filter(t => !t.isDone).sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
    const completed = todos.filter(t => t.isDone).sort((a,b) => (b.completedAt?.toMillis() || 0) - (a.completedAt?.toMillis() || 0));
    return { activeTodos: active, completedTodos: completed };
  }, [todos]);

  const TodoItem: React.FC<{ todo: Todo }> = ({ todo }) => {
     const isNew = !todo.isDone && (!todo.seenBy || !todo.seenBy.includes(currentUser.id));
     return (
        <div className={`relative bg-white p-4 rounded-xl shadow-md border flex items-start gap-4 transition-opacity ${todo.isDone ? 'opacity-60' : ''}`}>
            {isNew && <span className="absolute top-4 left-1 w-2.5 h-2.5 bg-blue-500 rounded-full" title="Új teendő"></span>}
            <input
                type="checkbox"
                checked={todo.isDone}
                onChange={() => handleToggleTodo(todo)}
                disabled={todo.isDone}
                className="mt-1 h-6 w-6 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-labelledby={`todo-text-${todo.id}`}
            />
            <div className="flex-grow">
                <p id={`todo-text-${todo.id}`} className={`text-gray-800 ${todo.isDone ? 'line-through text-gray-500' : ''}`}>{todo.text}</p>
                <p className="text-xs text-gray-400 mt-1">
                    Létrehozta: <span className="font-semibold">{todo.createdBy}</span>
                    {todo.createdAt && ` - ${todo.createdAt.toDate().toLocaleString('hu-HU')}`}
                </p>
                {todo.isDone && todo.completedBy && (
                    <p className="text-xs text-green-600 font-semibold mt-0.5">
                        Elvégezte: {todo.completedBy}
                        {todo.completedAt && ` - ${todo.completedAt.toDate().toLocaleString('hu-HU')}`}
                    </p>
                )}
            </div>
        </div>
     );
  };


  return (
    <div className="p-4 md:p-8">
      <form onSubmit={handleAddNewTodo} className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Új vezetői teendő hozzáadása</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newTodoText}
            onChange={(e) => setNewTodoText(e.target.value)}
            placeholder="Mit kell tenni?"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition"
            disabled={isSubmitting}
          />
          <button
            type="submit"
            disabled={isSubmitting || newTodoText.trim() === ''}
            className="bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Mentés...' : 'Hozzáadás'}
          </button>
        </div>
      </form>
      
      {loading && <div className="relative h-64"><LoadingSpinner /></div>}
      {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-r-lg" role="alert"><p className="font-bold">Hiba történt</p><p>{error}</p></div>}
      
      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h3 className="text-2xl font-bold text-gray-800 mb-4">Vezetői Aktuális Feladatok ({activeTodos.length})</h3>
            {activeTodos.length > 0 ? (
                <div className="space-y-4">
                    {activeTodos.map(todo => <TodoItem key={todo.id} todo={todo} />)}
                </div>
            ) : (
                <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl">
                    <AdminTodoIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700">Minden vezetői feladat elvégezve!</h3>
                    <p className="text-gray-500 mt-1">Nincsenek aktív vezetői teendők.</p>
                </div>
            )}
          </div>
          
           <div>
            <h3 className="text-2xl font-bold text-gray-800 mb-4">Vezetői Elvégzett Feladatok ({completedTodos.length})</h3>
             {completedTodos.length > 0 ? (
                <div className="space-y-4">
                    {completedTodos.map(todo => <TodoItem key={todo.id} todo={todo} />)}
                </div>
            ) : (
                 <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl">
                    <AdminTodoIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700">Nincsenek elvégzett vezetői feladatok</h3>
                    <p className="text-gray-500 mt-1">Még egy vezetői teendő sem lett kipipálva.</p>
                </div>
            )}
          </div>
        </div>
      )}
       {todoToConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
                <h2 className="text-xl font-bold text-gray-800">Megerősítés</h2>
                <p className="text-gray-600 my-4">Biztosan elvégezted ezt a feladatot? A művelet nem visszavonható.</p>
                <div className="flex justify-center gap-4">
                    <button onClick={() => setTodoToConfirm(null)} className="bg-gray-200 text-gray-800 font-bold py-2 px-6 rounded-lg hover:bg-gray-300">Mégse</button>
                    <button onClick={handleConfirmComplete} className="bg-green-700 text-white font-bold py-2 px-6 rounded-lg hover:bg-green-800">Elvégeztem</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AdminTodoApp;