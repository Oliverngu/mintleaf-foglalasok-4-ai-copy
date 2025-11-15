import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { User, Unit } from '../../data/mockData';
import { db, serverTimestamp } from '../../firebase/config';
import { 
    collection, 
    onSnapshot, 
    orderBy, 
    query, 
    limitToLast,
    addDoc,
    runTransaction,
    doc,
    setDoc,
    where,
    Timestamp,
} from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';
import LoadingSpinner from '../LoadingSpinner';
import ChatIcon from '../icons/ChatIcon';

// --- INTERFACES ---
interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: Timestamp;
    mentions?: string[];
    reactions?: { [key: string]: string[] }; // emoji -> userId[]
}

interface TypingStatus {
    name: string;
    lastTyped: Timestamp;
}

interface ChatAppProps {
  currentUser: User;
  allUsers: User[];
  allUnits: Unit[];
  activeUnitIds: string[];
}

// --- MAIN COMPONENT ---
const ChatApp: React.FC<ChatAppProps> = ({ currentUser, allUsers, allUnits, activeUnitIds }) => {
    const activeUnitId = activeUnitIds.length === 1 ? activeUnitIds[0] : null;

    if (!activeUnitId) {
        return (
            <div className="flex items-center justify-center h-full text-center p-8">
                <div>
                    <ChatIcon className="h-16 w-16 text-gray-400 mx-auto mb-4"/>
                    <h2 className="text-2xl font-bold text-gray-700">Válassz egy egységet</h2>
                    <p className="mt-2 text-gray-600">A chat használatához kérlek, válassz ki egyetlen egységet a fejlécben.</p>
                </div>
            </div>
        );
    }
    
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [typingUsers, setTypingUsers] = useState<string[]>([]);
    const [mentionQuery, setMentionQuery] = useState('');
    const [showMentions, setShowMentions] = useState(false);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const currentUserFullName = `${currentUser.lastName} ${currentUser.firstName}`;

    // --- DATA FETCHING & REAL-TIME LISTENERS ---
    useEffect(() => {
        setIsLoading(true);
        const messagesQuery = query(
            collection(db, 'units', activeUnitId, 'chatMessages'),
            orderBy('timestamp', 'asc'),
            limitToLast(50)
        );
        const unsubscribeMessages = onSnapshot(messagesQuery, snapshot => {
            const fetchedMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
            setMessages(fetchedMessages);
            setIsLoading(false);
        }, err => {
            console.error("Error fetching chat messages:", err);
            setError('Hiba az üzenetek betöltésekor.');
            setIsLoading(false);
        });
        
        const fiveSecondsAgo = new Date(Date.now() - 5000);
        const typingQuery = query(
            collection(db, 'units', activeUnitId, 'typing'),
            where('lastTyped', '>', fiveSecondsAgo)
        );
        const unsubscribeTyping = onSnapshot(typingQuery, snapshot => {
            const typingNames = snapshot.docs
                .map(doc => doc.data().name)
                .filter(name => name !== currentUserFullName); // Exclude self
            setTypingUsers(typingNames);
        });

        return () => {
            unsubscribeMessages();
            unsubscribeTyping();
        };
    }, [activeUnitId, currentUserFullName]);

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);


    // --- USERS IN CURRENT CHAT for @mentions ---
    const usersInUnit = useMemo(() => 
        allUsers.filter(user => user.unitIds?.includes(activeUnitId || ''))
    , [allUsers, activeUnitId]);

    const filteredMentions = useMemo(() => {
        if (!mentionQuery) return usersInUnit;
        return usersInUnit.filter(user => 
            `${user.lastName} ${user.firstName}`.toLowerCase().includes(mentionQuery.toLowerCase()) ||
            user.name.toLowerCase().includes(mentionQuery.toLowerCase())
        );
    }, [mentionQuery, usersInUnit]);

    // --- HANDLERS ---
    const handleSendMessage = async () => {
        const text = newMessage.trim();
        if (text === '' || !activeUnitId) return;

        // 1. AI Content Moderation
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            const prompt = `Analyze the following text for toxicity, insults, profanity, or other inappropriate content. Respond with only 'SAFE' if it's acceptable for a workplace chat, or 'UNSAFE' if it is not. Text: "${text}"`;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            if (response.text.trim().toUpperCase() === 'UNSAFE') {
                if (!window.confirm("Ez az üzenet sértő lehet. Biztosan el szeretnéd küldeni?")) {
                    return; // User chose to edit
                }
            }
        } catch (aiError) {
            console.error("AI moderation failed, sending message without check:", aiError);
        }
        
        // 2. Prepare and send message
        const mentions = text.match(/@\[([^\]]+)\]\(([^)]+)\)/g)?.map(mention => mention.match(/\(([^)]+)\)/)?.[1] || '') || [];
        const cleanText = text.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, '@$1');

        const messageData = {
            senderId: currentUser.id,
            senderName: currentUserFullName,
            text: cleanText,
            timestamp: serverTimestamp(),
            mentions: [...new Set(mentions)],
            reactions: {},
        };

        setNewMessage('');
        await addDoc(collection(db, 'units', activeUnitId, 'chatMessages'), messageData);
    };

    const handleReaction = (messageId: string, emoji: string) => {
        if (!activeUnitId) return;
        const messageRef = doc(db, 'units', activeUnitId, 'chatMessages', messageId);

        runTransaction(db, async (transaction) => {
            const doc = await transaction.get(messageRef);
            if (!doc.exists()) return;

            const reactions = doc.data()?.reactions || {};
            const userList: string[] = reactions[emoji] || [];
            
            if (userList.includes(currentUser.id)) {
                // User is removing their reaction
                reactions[emoji] = userList.filter(id => id !== currentUser.id);
                if (reactions[emoji].length === 0) {
                    delete reactions[emoji];
                }
            } else {
                // User is adding a reaction
                reactions[emoji] = [...userList, currentUser.id];
            }
            transaction.update(messageRef, { reactions });
        }).catch(err => console.error("Reaction transaction failed:", err));
    };

    const handleTyping = (text: string) => {
        setNewMessage(text);

        // Handle mentions
        const mentionMatch = text.match(/@(\w*)$/);
        if (mentionMatch) {
            setMentionQuery(mentionMatch[1]);
            setShowMentions(true);
        } else {
            setShowMentions(false);
        }

        // Handle typing indicator
        if (activeUnitId) {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                setDoc(doc(db, 'units', activeUnitId, 'typing', currentUser.id), {
                    name: currentUserFullName,
                    lastTyped: serverTimestamp(),
                });
            }, 500);
        }
    };
    
    const handleMentionSelect = (user: User) => {
        const newText = newMessage.replace(/@\w*$/, `@[${user.lastName} ${user.firstName}](${user.id}) `);
        setNewMessage(newText);
        setShowMentions(false);
        textAreaRef.current?.focus();
    };


    // --- RENDER LOGIC ---
    return (
        <div className="flex flex-col h-full bg-gray-100">
            {/* Message List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isLoading ? <LoadingSpinner /> : (
                    messages.map(msg => <MessageBubble key={msg.id} message={msg} currentUser={currentUser} onReact={handleReaction} />)
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
                <div className="px-4 pb-1 text-sm text-gray-500 italic">
                    {typingUsers.join(', ')} éppen ír...
                </div>
            )}
            
            {/* Input Area */}
            <div className="p-4 bg-white border-t relative">
                {showMentions && (
                    <div className="absolute bottom-full left-0 right-0 p-2 bg-white border rounded-t-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredMentions.length > 0 ? (
                            filteredMentions.map(user => (
                                <div key={user.id} onClick={() => handleMentionSelect(user)} className="p-2 hover:bg-gray-100 rounded cursor-pointer">
                                    <p className="font-semibold">{`${user.lastName} ${user.firstName}`}</p>
                                    <p className="text-sm text-gray-500">@{user.name}</p>
                                </div>
                            ))
                        ) : <p className="p-2 text-gray-500">Nincs találat</p>}
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <textarea
                        ref={textAreaRef}
                        value={newMessage}
                        onChange={(e) => handleTyping(e.target.value)}
                        onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}}
                        placeholder="Írj üzenetet..."
                        className="w-full p-2 border rounded-lg resize-none"
                        rows={1}
                    />
                    <button onClick={handleSendMessage} className="bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 disabled:bg-gray-400" disabled={!newMessage.trim()}>
                        Küldés
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENTS ---
const MessageBubble: React.FC<{
    message: ChatMessage;
    currentUser: User;
    onReact: (messageId: string, emoji: string) => void;
}> = ({ message, currentUser, onReact }) => {
    const isSender = message.senderId === currentUser.id;
    const availableReactions = ['👍', '❤️', '😂', '😮'];
    const highlightMentions = (text: string) => {
        return text.split(/(@\w+)/g).map((part, index) => {
            if (part.startsWith('@')) {
                return <span key={index} className="font-bold text-blue-600 bg-blue-100 rounded px-1">{part}</span>;
            }
            return part;
        });
    };

    return (
        <div className={`flex items-end gap-2 ${isSender ? 'justify-end' : ''}`}>
            {!isSender && <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center font-bold text-white shrink-0">{message.senderName.charAt(0)}</div>}
            <div className={`max-w-md lg:max-w-lg p-3 rounded-2xl group relative ${isSender ? 'bg-green-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none'}`}>
                {!isSender && <p className="font-bold text-sm mb-1">{message.senderName}</p>}
                <p className="whitespace-pre-wrap">{highlightMentions(message.text)}</p>
                <p className={`text-xs mt-1 ${isSender ? 'text-green-200' : 'text-gray-400'}`}>
                    {message.timestamp?.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                </p>
                {/* Reactions */}
                <div className="absolute -bottom-4 left-2 flex gap-1">
                    {Object.entries(message.reactions || {}).map(([emoji, userIds]) => 
                        Array.isArray(userIds) && userIds.length > 0 && (
                        <div key={emoji} className="bg-white rounded-full px-2 py-0.5 text-xs shadow border flex items-center gap-1">
                            <span>{emoji}</span>
                            <span className="font-semibold">{userIds.length}</span>
                        </div>
                    ))}
                </div>
                {/* Reaction Picker */}
                <div className="absolute top-0 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex bg-white p-1 rounded-full shadow border">
                    {availableReactions.map(emoji => (
                         <button key={emoji} onClick={() => onReact(message.id, emoji)} className="p-1 hover:bg-gray-200 rounded-full text-lg">
                             {emoji}
                         </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ChatApp;