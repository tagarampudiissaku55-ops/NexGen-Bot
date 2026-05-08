/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, Bot, Phone, Mail, Loader2, ChevronRight, Mic, MicOff, Volume2, VolumeX, Info } from 'lucide-react';
import { chatWithGemini } from './services/gemini';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
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

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const response = await chatWithGemini(text, history);
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: response,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, botMsg]);
      speak(response);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F0F2F5] font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)]">
        <div className="flex items-center gap-3">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200"
          >
            <Bot size={28} strokeWidth={2.5} />
          </motion.div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-gray-800">Next Gen Assistant</h1>
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
              <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Active Campus Support</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
            className={`p-2.5 rounded-xl transition-all ${isVoiceEnabled ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
            title={isVoiceEnabled ? "Disable Voice Output" : "Enable Voice Output"}
          >
            {isVoiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className={`hidden sm:flex p-2.5 rounded-xl transition-all ${showInfo ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
            title="College Info"
          >
            <Info size={20} />
          </button>
        </div>
      </header>

      {/* Info Sidebar Overlay (Mobile/Desktop) */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed right-0 top-[81px] bottom-0 w-80 bg-white shadow-2xl z-30 p-6 border-l border-gray-100 overflow-y-auto"
          >
            <div className="space-y-6">
              <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2 border-b pb-4">
                <Info size={20} className="text-indigo-600" />
                Quick NGCE Facts
              </h2>
              <div className="space-y-4">
                <section>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Location</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">Next Gen Campus, Knowledge Park, City.</p>
                </section>
                <section>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Contact</h3>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-600 flex items-center gap-2">
                      <Phone size={14} /> +91 9876543210
                    </p>
                    <p className="text-sm text-gray-600 flex items-center gap-2">
                      <Mail size={14} /> info@nextgencollege.edu
                    </p>
                  </div>
                </section>
                <section className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                  <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Admissions Open</h3>
                  <p className="text-sm text-indigo-900 font-medium">May - July 2026</p>
                  <button className="mt-3 w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">
                    Apply Now
                  </button>
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
                  msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-100'
                }`}>
                  {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                </div>
                <div className={`relative p-5 rounded-2xl shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-white border border-indigo-100 text-indigo-900 rounded-tr-none' 
                    : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'
                }`}>
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap font-medium">
                    {msg.content}
                  </p>
                  <div className={`absolute -bottom-6 left-0 right-0 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">
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
                <div className="w-9 h-9 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-indigo-600 shadow-sm">
                  <Bot size={20} />
                </div>
                <div className="bg-white border border-gray-100 px-5 py-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce"></div>
                  </div>
                  <span className="text-sm text-gray-400 font-bold uppercase tracking-widest">Assistant Researching...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </main>

      {/* Footer / Input Area */}
      <footer className="bg-white border-t border-gray-100 p-4 md:p-6 sticky bottom-0 z-20 shadow-[0_-5px_25px_-10px_rgba(0,0,0,0.05)]">
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
                  className="whitespace-nowrap px-4 py-2.5 bg-white hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 text-[13px] font-bold rounded-xl border border-gray-100 hover:border-indigo-200 transition-all flex items-center gap-2 group shadow-sm active:scale-95"
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
                  : 'bg-white border border-gray-100 text-gray-400 hover:text-indigo-600 hover:border-indigo-100'
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
                className="w-full bg-gray-50 border border-transparent rounded-2xl px-6 py-4.5 pr-16 text-[15px] font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white focus:border-indigo-500 transition-all placeholder:text-gray-300 placeholder:font-bold shadow-inner"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white rounded-xl transition-all shadow-lg shadow-indigo-200 active:scale-95 flex items-center gap-2"
              >
                <span className="hidden sm:inline font-bold text-xs uppercase tracking-widest">Send</span>
                <Send size={18} />
              </button>
            </form>
          </div>
          
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] px-2">
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
