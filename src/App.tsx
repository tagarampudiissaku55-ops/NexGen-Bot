/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, Bot, Phone, Mail, Loader2, ChevronRight, Mic, MicOff, Volume2, VolumeX, Info, LogIn, LogOut, Trash2, Sun, Moon } from 'lucide-react';
import { chatWithGemini } from './services/gemini';
import { auth, db } from './lib/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot,
  doc,
  setDoc,
  updateDoc
} from 'firebase/firestore';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date | any;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Speech Recognition Type Definitions
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const QUICK_ACTIONS = [
  "What courses are available?",
  "Tell me about B.Tech CSE.",
  "What are the fees for MBA?",
  "Are there any scholarships?",
  "How are the placements?",
  "Tell me about the campus facilities."
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      content: "Welcome to Next Gen College! I am your AI Assistant. How can I help you today?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Apply Dark Mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        initSession(u.uid);
      } else {
        setSessionId(null);
      }
    });
  }, []);

  const initSession = async (uid: string) => {
    const newSessionId = `session_${Date.now()}`;
    setSessionId(newSessionId);
    
    try {
      const sessionRef = doc(db, 'chat_sessions', newSessionId);
      await setDoc(sessionRef, {
        userId: uid,
        startedAt: serverTimestamp(),
        lastMessage: "Session Started"
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `chat_sessions/${newSessionId}`);
    }
  };

  const clearHistory = async () => {
    if (!user) {
      setMessages([{
        id: 'welcome',
        role: 'model',
        content: "Draft history cleared locally. Login to save your progress!",
        timestamp: new Date()
      }]);
      return;
    }

    if (confirm("Are you sure you want to start a new chat session?")) {
      initSession(user.uid);
    }
  };

  // Listen for messages if session exists
  useEffect(() => {
    if (!sessionId || !user) return;

    const q = query(
      collection(db, 'chat_sessions', sessionId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        timestamp: d.data().timestamp?.toDate() || new Date()
      })) as Message[];
      
      if (msgs.length > 0) {
        setMessages([
          {
            id: 'welcome',
            role: 'model',
            content: "Welcome to Next Gen College! I am your AI Assistant. How can I help you today?",
            timestamp: new Date()
          },
          ...msgs
        ]);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chat_sessions/${sessionId}/messages`);
    });

    return () => unsubscribe();
  }, [sessionId, user]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Voice Synthesis (TTS)
  const speak = useCallback((text: string) => {
    if (!isVoiceEnabled) return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';
    
    // Pick a nicer female voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Female')) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;

    window.speechSynthesis.speak(utterance);
  }, [isVoiceEnabled]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setMessages([{
        id: 'welcome',
        role: 'model',
        content: "Welcome to Next Gen College! I am your AI Assistant. How can I help you today?",
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsgData = {
      role: 'user' as const,
      content: text,
      timestamp: new Date()
    };

    if (!user) {
      // Temporary message for non-logged in users
      setMessages(prev => [...prev, { id: Date.now().toString(), ...userMsgData }]);
    }

    setInput('');
    setIsLoading(true);

    try {
      // Save user message to Firestore if logged in
      if (user && sessionId) {
        const msgRef = collection(db, 'chat_sessions', sessionId, 'messages');
        await addDoc(msgRef, {
          text,
          role: 'user',
          timestamp: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `chat_sessions/${sessionId}/messages`));
      }

      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const response = await chatWithGemini(text, history);
      
      // Save bot response to Firestore if logged in
      if (user && sessionId) {
        const msgRef = collection(db, 'chat_sessions', sessionId, 'messages');
        await addDoc(msgRef, {
          text: response,
          role: 'model',
          timestamp: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `chat_sessions/${sessionId}/messages`));

        // Update session last message
        const sessionRef = doc(db, 'chat_sessions', sessionId);
        await updateDoc(sessionRef, {
          lastMessage: response,
          lastUpdatedAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `chat_sessions/${sessionId}`));
      } else {
        const botMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          content: response,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botMsg]);
      }
      
      speak(response);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F0F2F5] dark:bg-black font-sans text-gray-900 dark:text-gray-100 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)]">
        <div className="flex items-center gap-3">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200"
          >
            <Bot size={28} strokeWidth={2.5} />
          </motion.div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-gray-800 dark:text-gray-100">Next Gen Assistant</h1>
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">Active Campus Support</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <button 
              onClick={handleLogout}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/20 transition-all border border-red-100 dark:border-red-800"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          ) : (
            <button 
              onClick={handleLogin}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm"
            >
              <LogIn size={14} />
              Login for History
            </button>
          )}
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button 
            onClick={clearHistory}
            className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-all"
            title="Clear Chat History"
          >
            <Trash2 size={20} />
          </button>
          <button 
            onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
            className={`p-2.5 rounded-xl transition-all ${isVoiceEnabled ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            title={isVoiceEnabled ? "Disable Voice Output" : "Enable Voice Output"}
          >
            {isVoiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className={`hidden sm:flex p-2.5 rounded-xl transition-all ${showInfo ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            title="College Info"
          >
            <Info size={20} />
          </button>
        </div>
      </header>

      {/* Info Sidebar Overlay */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed right-0 top-[81px] bottom-0 w-80 bg-white dark:bg-gray-900 shadow-2xl z-30 p-6 border-l border-gray-100 dark:border-gray-800 overflow-y-auto font-sans"
          >
            <div className="space-y-6">
              <h2 className="font-bold text-lg text-gray-800 dark:text-gray-100 flex items-center gap-2 border-b dark:border-gray-800 pb-4">
                <Info size={20} className="text-indigo-600" />
                Next Gen Campus
              </h2>
              <div className="space-y-6">
                <section>
                  <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-3">Core Hubs</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                        <Bot size={18} />
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-gray-700 dark:text-gray-200">AI Innovation Lab</p>
                        <p className="text-gray-500">Block A-102</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
                        <GraduationCap size={18} />
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-gray-700 dark:text-gray-200">Career Center</p>
                        <p className="text-gray-500">Student Plaza</p>
                      </div>
                    </div>
                  </div>
                </section>
                
                <section>
                  <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-3">Campus Vibe</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">Global Partners</span>
                      <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold">12+ Countries</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">2026 Admissions</span>
                      <span className="text-green-500 font-bold">Active</span>
                    </div>
                  </div>
                </section>

                <section className="bg-indigo-600 p-5 rounded-2xl text-white shadow-lg shadow-indigo-200 dark:shadow-none">
                  <h3 className="text-xs font-bold opacity-80 uppercase tracking-widest mb-1">Highlight</h3>
                  <p className="font-bold text-lg leading-tight mb-1">TechVishwa 2026</p>
                  <p className="text-xs opacity-90 mb-4 font-medium italic">"Building the Zero-One Future"</p>
                  <button className="w-full py-2.5 bg-white text-indigo-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-50 transition-colors">
                    Register Now
                  </button>
                </section>
                
                <section className="pt-4 border-t dark:border-gray-800">
                   <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center uppercase tracking-widest leading-relaxed">
                     Next Gen College of Engineering<br/>
                     Knowledge Park, Sector 4<br/>
                     © 2026 All Rights Reserved
                   </p>
                </section>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto px-4 py-8 md:px-6 space-y-8 max-w-4xl mx-auto w-full scroll-smooth">
        <AnimatePresence mode="popLayout">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: "backOut" }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[88%] md:max-w-[80%] flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm ${
                  msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-700'
                }`}>
                  {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                </div>
                <div className={`relative p-5 rounded-2xl shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-white dark:bg-gray-800 border border-indigo-100 dark:border-indigo-900 text-indigo-900 dark:text-indigo-100 rounded-tr-none' 
                    : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-none'
                }`}>
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap font-medium">
                    {msg.content}
                  </p>
                  <div className={`absolute -bottom-6 left-0 right-0 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-tight">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="flex gap-4 items-start">
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
                  <Bot size={20} />
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-5 py-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce"></div>
                  </div>
                  <span className="text-sm text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">Assistant Researching...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </main>

      {/* Footer / Input Area */}
      <footer className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 p-4 md:p-6 sticky bottom-0 z-20 shadow-[0_-5px_25px_-10px_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Quick Actions */}
          {messages.length < 5 && !isLoading && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
              {QUICK_ACTIONS.map((action, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => handleSend(action)}
                  className="whitespace-nowrap px-4 py-2.5 bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 text-[13px] font-bold rounded-xl border border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all flex items-center gap-2 group shadow-sm active:scale-95"
                >
                  {action}
                  <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transform translate-x-1 group-hover:translate-x-0 transition-all" />
                </motion.button>
              ))}
            </div>
          )}

          {/* Input Interface */}
          <div className="relative flex items-center gap-3">
            <button
              onClick={toggleListening}
              className={`p-4 rounded-2xl transition-all shadow-md active:scale-95 ${
                isListening 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-indigo-600 hover:border-indigo-100'
              }`}
              title={isListening ? "Stop Listening" : "Start Voice Input"}
            >
              {isListening ? <Mic size={24} /> : <MicOff size={24} />}
            </button>

            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
              className="flex-1 relative flex items-center"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isListening ? "Listening..." : "Ask Next Gen Assistant..."}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-transparent dark:border-gray-700 rounded-2xl px-6 py-4.5 pr-16 text-[15px] font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white dark:focus:bg-gray-700 focus:border-indigo-500 transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600 placeholder:font-bold shadow-inner"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 text-white rounded-xl transition-all shadow-lg shadow-indigo-200 dark:shadow-none active:scale-95 flex items-center gap-2"
              >
                <span className="hidden sm:inline font-bold text-xs uppercase tracking-widest">Send</span>
                <Send size={18} />
              </button>
            </form>
          </div>
          
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-[0.2em] px-2">
            <span>Next Gen College of Engineering</span>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
              <span>24/7 Virtual Support</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Tailwind Utility for hiding scrollbar */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
