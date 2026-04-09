import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, arrayUnion } from 'firebase/firestore';
import { Play, Square, Home as HomeIcon, Trophy, Settings as SettingsIcon, Plus, UserPlus, Bell, Activity, CheckCircle, Tag, Trash2, Edit3, X } from 'lucide-react';

// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyBaj4AVuc7CQtg3Nul3VmmWZo0ZPO5GEnQ",
  authDomain: "reclaimwell-76297.firebaseapp.com",
  projectId: "reclaimwell-76297",
  storageBucket: "reclaimwell-76297.firebasestorage.app",
  messagingSenderId: "189504031735",
  appId: "1:189504031735:web:f81f2fb2cbfec046dcbcf2",
  measurementId: "G-HZJ14W0SS4"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'reclaim-app';

// --- Swipeable Session Item Component ---
const SessionItem = ({ s, onEdit, onDelete }) => {
  const [offset, setOffset] = useState(0);
  const [startX, setStartX] = useState(0);
  
  const onTouchStart = (e) => setStartX(e.touches[0].clientX);
  const onTouchMove = (e) => {
    const diff = startX - e.touches[0].clientX;
    if (diff > 0) setOffset(Math.min(diff, 80));
    else setOffset(0);
  };
  const onTouchEnd = () => {
    if (offset > 40) setOffset(80);
    else setOffset(0);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl mb-3 bg-red-500 shadow-sm">
      <div className="absolute inset-y-0 right-0 w-20 flex items-center justify-center">
        <button onClick={() => onDelete(s.id)} className="w-full h-full flex items-center justify-center text-white active:bg-red-600 transition-colors">
          <Trash2 size={24} />
        </button>
      </div>
      <div 
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(-${offset}px)` }}
        className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm relative z-10 transition-transform duration-200"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center">
            <CheckCircle size={20} />
          </div>
          <div>
            <p className="font-semibold text-slate-200">{s.category}</p>
            <p className="text-xs text-slate-500">{new Date(s.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="font-bold text-lg text-white">{s.durationMins} <span className="text-sm text-slate-400 font-medium">m</span></p>
          <button onClick={() => onEdit(s)} className="text-slate-600 hover:text-teal-400 p-1">
            <Edit3 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [loading, setLoading] = useState(true);

  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signUpName, setSignUpName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMsg, setAuthMsg] = useState('');

  // App Data State
  const [profile, setProfile] = useState({ displayName: '', dailyGoal: 60, strictMode: false, friends: [] });
  const [sessions, setSessions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);

  // Session State
  const [sessionStart, setSessionStart] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [pendingSession, setPendingSession] = useState(null); 
  const sessionRef = useRef({ start: null, strictMode: false });

  // Custom Tag & Edit State
  const [isCustomTag, setIsCustomTag] = useState(false);
  const [customTagInput, setCustomTagInput] = useState('');
  const [editingSession, setEditingSession] = useState(null);

  // Friend System State
  const [friendInput, setFriendInput] = useState('');
  const [friendMessage, setFriendMessage] = useState({ text: '', type: '' });
  const [boardView, setBoardView] = useState('friends'); 
  const myFriendCode = user?.uid ? user.uid.substring(0, 6).toUpperCase() : '';

  // --- Auth Setup ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError(''); setAuthMsg('');
    try {
      if (isSignUp) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const nameToSave = signUpName.trim() || 'New Explorer';
        // Initialize user immediately
        await setDoc(doc(db, 'artifacts', appId, 'users', cred.user.uid, 'profile', 'data'), { displayName: nameToSave, dailyGoal: 60, strictMode: false, friends: [] });
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'leaderboard', cred.user.uid), { displayName: nameToSave, weekTotalMinutes: 0, friendCode: cred.user.uid.substring(0,6).toUpperCase(), lastActive: Date.now() });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setAuthError("Please enter your email address in the box first.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthError('');
      setAuthMsg("Password reset email sent! Check your inbox.");
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveTab('home');
    } catch (err) { console.error("Logout error", err); }
  };

  // --- Data Fetching ---
  useEffect(() => {
    if (!user) return;

    setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'leaderboard', user.uid), {
      friendCode: user.uid.substring(0, 6).toUpperCase(),
      lastActive: Date.now()
    }, { merge: true }).catch(console.error);

    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data');
    const unsubProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) setProfile((prev) => ({ ...prev, ...docSnap.data() }));
    }, (err) => console.error("Profile fetch error:", err));

    const sessionsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'sessions');
    const unsubSessions = onSnapshot(sessionsRef, (snapshot) => {
      const sessData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSessions(sessData);
    }, (err) => console.error("Sessions fetch error:", err));

    const leaderboardRef = collection(db, 'artifacts', appId, 'public', 'data', 'leaderboard');
    const unsubLeaderboard = onSnapshot(leaderboardRef, (snapshot) => {
      const boardData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      boardData.sort((a, b) => (b.weekTotalMinutes || 0) - (a.weekTotalMinutes || 0));
      setLeaderboard(boardData);
    }, (err) => console.error("Leaderboard fetch error:", err));

    return () => { unsubProfile(); unsubSessions(); unsubLeaderboard(); };
  }, [user]);

  // --- Timer Logic ---
  useEffect(() => {
    sessionRef.current = { start: sessionStart, strictMode: profile.strictMode };
  }, [sessionStart, profile.strictMode]);

  useEffect(() => {
    let interval;
    if (sessionStart) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - sessionStart) / 1000));
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [sessionStart]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const currentSession = sessionRef.current;
        if (currentSession.start && currentSession.strictMode) {
          const durationMins = Math.floor((Date.now() - currentSession.start) / 60000);
          handleAutoEndSession(durationMins);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const sendNotification = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon-192x192.png' });
    }
  };

  const startSession = () => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    setSessionStart(Date.now());
    sendNotification("Session Started", "Put your phone down. We'll keep tracking.");
  };

  const endSession = () => {
    if (!sessionStart) return;
    const durationMins = Math.floor((Date.now() - sessionStart) / 60000);
    setSessionStart(null);
    setPendingSession({ durationMins, timestamp: Date.now() });
    setIsCustomTag(false);
    sendNotification("Session Ended", `You were away for ${durationMins} minutes!`);
  };

  const handleAutoEndSession = (durationMins) => {
    setSessionStart(null);
    setPendingSession({ durationMins, timestamp: Date.now(), autoEnded: true });
    sendNotification("Session Auto-Ended", `Strict mode ended your session after ${durationMins} mins.`);
  };

  const syncLeaderboard = async (newSessionsList) => {
    const currentWeekTotal = calculateWeekTotal(newSessionsList);
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'leaderboard', user.uid), {
      weekTotalMinutes: currentWeekTotal,
      lastActive: Date.now()
    }, { merge: true });
  };

  const saveSession = async (category) => {
    if (!user || !pendingSession) return;
    const finalDuration = Math.max(pendingSession.durationMins, 1);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'sessions'), {
        durationMins: finalDuration,
        category,
        timestamp: pendingSession.timestamp
      });
      const updatedSessions = [...sessions, { durationMins: finalDuration, category, timestamp: pendingSession.timestamp }];
      await syncLeaderboard(updatedSessions);
      setPendingSession(null);
      setActiveTab('home');
    } catch (err) { console.error("Error saving session:", err); }
  };

  const deleteSession = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'sessions', id));
      const updatedSessions = sessions.filter(s => s.id !== id);
      await syncLeaderboard(updatedSessions);
    } catch (err) { console.error("Error deleting", err); }
  };

  const saveEditedSession = async () => {
    if (!editingSession) return;
    try {
      const finalDuration = Math.max(parseInt(editingSession.durationMins) || 1, 1);
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'sessions', editingSession.id), {
        durationMins: finalDuration,
        category: editingSession.category || 'Untagged'
      });
      const updatedSessions = sessions.map(s => s.id === editingSession.id ? { ...s, durationMins: finalDuration, category: editingSession.category } : s);
      await syncLeaderboard(updatedSessions);
      setEditingSession(null);
    } catch (err) { console.error("Error updating", err); }
  };

  const updateProfile = async (updates) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { ...profile, ...updates }, { merge: true });
      if (updates.displayName !== undefined) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'leaderboard', user.uid), {
          displayName: updates.displayName || 'Anonymous Explorer',
          weekTotalMinutes: calculateWeekTotal(sessions),
          friendCode: myFriendCode,
          lastActive: Date.now()
        }, { merge: true });
      }
    } catch (err) { console.error("Error saving profile", err); }
  };

  const handleAddFriend = async () => {
    setFriendMessage({ text: '', type: '' });
    const code = friendInput.trim().toUpperCase();
    if (!code) return;
    if (code === myFriendCode) {
      setFriendMessage({ text: "You can't add yourself!", type: 'error' });
      return;
    }
    const friend = leaderboard.find(u => u.friendCode === code);
    if (friend) {
      const currentFriends = profile.friends || [];
      if (currentFriends.includes(friend.id)) {
        setFriendMessage({ text: "Already friends with " + friend.displayName, type: 'error' });
      } else {
        // Add them to my list
        await updateProfile({ friends: [...currentFriends, friend.id] });
        // Add me to their list (Mutual Friendship)
        await setDoc(doc(db, 'artifacts', appId, 'users', friend.id, 'profile', 'data'), {
           friends: arrayUnion(user.uid)
        }, { merge: true });
        
        setFriendMessage({ text: "Added " + (friend.displayName || 'New Friend') + "!", type: 'success' });
        setFriendInput('');
      }
    } else {
      setFriendMessage({ text: "Friend code not found.", type: 'error' });
    }
    setTimeout(() => setFriendMessage({ text: '', type: '' }), 3000);
  };

  // --- Calculations ---
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const calculateTodayTotal = (sessList) => sessList.filter(s => s.timestamp >= todayStart).reduce((acc, curr) => acc + curr.durationMins, 0);
  const calculateWeekTotal = (sessList) => {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1))).setHours(0,0,0,0);
    return sessList.filter(s => s.timestamp >= startOfWeek).reduce((acc, curr) => acc + curr.durationMins, 0);
  };

  const todayTotal = useMemo(() => calculateTodayTotal(sessions), [sessions]);
  const progressPercentage = Math.min((todayTotal / (profile.dailyGoal || 60)) * 100, 100);

  const formatTime = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h.toString()}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // --- Components ---
  const CircularProgress = ({ progress, size = 220, strokeWidth = 16, children }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (progress / 100) * circumference;
    return (
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90 drop-shadow-xl">
          <circle className="text-slate-800" strokeWidth={strokeWidth} stroke="currentColor" fill="transparent" r={radius} cx={size / 2} cy={size / 2} />
          <circle className="text-teal-400 transition-all duration-1000 ease-out" strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" stroke="currentColor" fill="transparent" r={radius} cx={size / 2} cy={size / 2} />
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center w-full">{children}</div>
      </div>
    );
  };

  const WeeklyProgress = () => {
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const now = new Date();
    const currentDayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1))).setHours(0,0,0,0);
    const dayTotals = Array(7).fill(0);
    sessions.forEach(s => {
      if (s.timestamp >= startOfWeek) {
        const d = new Date(s.timestamp);
        const idx = d.getDay() === 0 ? 6 : d.getDay() - 1;
        dayTotals[idx] += s.durationMins;
      }
    });
    return (
      <div className="flex justify-between w-full max-w-[280px] mt-8 px-2">
        {days.map((day, i) => {
          const fillPercent = Math.min((dayTotals[i] / (profile.dailyGoal || 60)) * 100, 100);
          return (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="relative w-8 h-8 flex items-center justify-center">
                <svg width="32" height="32" className="transform -rotate-90">
                  <circle className="text-slate-800" strokeWidth="4" stroke="currentColor" fill="transparent" r="14" cx="16" cy="16" />
                  <circle className={`${fillPercent >= 100 ? 'text-teal-400' : 'text-teal-500/60'}`} strokeWidth="4" strokeDasharray={14 * 2 * Math.PI} strokeDashoffset={(14 * 2 * Math.PI) - ((fillPercent / 100) * (14 * 2 * Math.PI))} strokeLinecap="round" stroke="currentColor" fill="transparent" r="14" cx="16" cy="16" />
                </svg>
                <span className={`absolute text-[10px] font-bold ${i === currentDayIndex ? 'text-teal-300' : 'text-slate-400'}`}>{day}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Loading Screen
  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-teal-400">
       <img src="/icon-192x192.png" className="w-24 h-24 rounded-3xl animate-pulse shadow-2xl shadow-teal-500/20" alt="Loading" />
    </div>
  );

  // --- LOGIN / SIGNUP UI ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
        <div className="w-full max-w-md bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <img src="/icon-192x192.png" alt="Logo" className="w-16 h-16 rounded-2xl mb-4 shadow-lg shadow-teal-500/20" />
            <h1 className="text-2xl font-black text-white">Reclaim</h1>
            <p className="text-slate-400 text-sm mt-1 text-center">{isSignUp ? 'Create an account to start tracking' : 'Welcome back, ready to disconnect?'}</p>
          </div>
          
          {authError && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 text-red-400 text-xs rounded-xl text-center">{authError}</div>}
          {authMsg && <div className="mb-4 p-3 bg-teal-500/10 border border-teal-500/50 text-teal-400 text-xs rounded-xl text-center">{authMsg}</div>}
          
          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <input type="text" value={signUpName} onChange={(e) => setSignUpName(e.target.value)} required className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal-500" placeholder="Display Name" />
            )}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal-500" placeholder="Email" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength="6" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal-500" placeholder="Password" />
            
            <div className="pt-2 space-y-3">
              <button type="submit" className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-lg py-3 rounded-xl">{isSignUp ? 'Create Account' : 'Log In'}</button>
              
              {!isSignUp && (
                <div className="text-center">
                  <button type="button" onClick={handleResetPassword} className="text-xs text-slate-500 hover:text-teal-400 font-medium transition-colors">Forgot Password?</button>
                </div>
              )}

              <div className="relative flex items-center py-2"><div className="flex-grow border-t border-slate-800"></div><span className="mx-4 text-slate-500 text-xs uppercase font-medium">Or</span><div className="flex-grow border-t border-slate-800"></div></div>
              <button type="button" onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); setAuthMsg(''); }} className="w-full bg-transparent border-2 border-slate-800 text-slate-300 font-bold text-lg py-3 rounded-xl hover:border-teal-500/50 transition-all">{isSignUp ? 'Log in to existing account' : 'Create a new account'}</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- MAIN APP UI ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 flex flex-col relative">
      <div className="pt-12 pb-4 px-6 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <img src="/icon-192x192.png" alt="Logo" className="w-8 h-8 rounded-lg" />
          <h1 className="text-xl font-bold tracking-tight text-white">Reclaim</h1>
        </div>
        <button onClick={() => { if(!sessionStart) setActiveTab('settings'); }} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${activeTab === 'settings' ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-teal-400'}`}><SettingsIcon size={16} /></button>
      </div>

      <main className="flex-1 px-6 overflow-y-auto flex flex-col items-center pb-6">
        
        {/* --- EDIT SESSION MODAL --- */}
        {editingSession && (
           <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
             <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm relative">
                <button onClick={() => setEditingSession(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={24} /></button>
                <h3 className="text-xl font-bold mb-6">Edit Session</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Duration (Mins)</label>
                    <input type="number" value={editingSession.durationMins} onChange={e => setEditingSession({...editingSession, durationMins: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Category</label>
                    <input type="text" value={editingSession.category} onChange={e => setEditingSession({...editingSession, category: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal-500" />
                  </div>
                  <button onClick={saveEditedSession} className="w-full bg-teal-500 text-slate-950 font-bold py-3 rounded-xl mt-4">Save Changes</button>
                </div>
             </div>
           </div>
        )}

        {/* --- HOME TAB --- */}
        {activeTab === 'home' && !pendingSession && (
          <div className="w-full flex flex-col items-center animate-in fade-in duration-500">
            <div className="mt-8 mb-4">
              <CircularProgress progress={progressPercentage}>
                <span className="text-5xl font-black text-white mb-1">{todayTotal}</span>
                <span className="text-sm font-medium text-slate-400 uppercase tracking-widest">Mins Today</span>
              </CircularProgress>
            </div>
            <WeeklyProgress />
            <div className="w-full mt-10">
              <h3 className="text-lg font-bold mb-4 flex justify-between items-end">
                Recent Breaks <span className="text-xs font-normal text-slate-500">Swipe left to delete</span>
              </h3>
              <div className="flex flex-col">
                {sessions.length === 0 ? <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center text-slate-500">No breaks recorded today.</div> : 
                 sessions.filter(s => s.timestamp >= todayStart).sort((a,b) => b.timestamp - a.timestamp).map(s => (
                  <SessionItem key={s.id} s={s} onEdit={setEditingSession} onDelete={deleteSession} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- SESSION / TIMER TAB --- */}
        {activeTab === 'session' && !pendingSession && (
          <div className="w-full flex-1 flex flex-col items-center justify-center">
            {!sessionStart ? (
              <div className="text-center flex flex-col items-center">
                <div className="w-24 h-24 bg-teal-500/20 rounded-full flex items-center justify-center mb-6 animate-pulse"><Activity className="text-teal-400" size={40} /></div>
                <h2 className="text-3xl font-black mb-3">Ready?</h2>
                <p className="text-slate-400 mb-10 max-w-[260px] text-center leading-relaxed">Put your phone down. If Strict Mode is on, leaving the app ends the session.</p>
                <button onClick={startSession} className="bg-teal-500 text-slate-950 font-bold text-xl py-5 px-12 rounded-full shadow-lg">Start Session</button>
              </div>
            ) : (
              <div className="text-center flex flex-col items-center">
                <div className="w-64 h-64 border-4 border-teal-500/30 rounded-full flex flex-col items-center justify-center mb-12 bg-slate-950 shadow-2xl px-2">
                  <span className="text-xs font-bold text-teal-400 uppercase mb-2">Time Away</span>
                  {/* Dynamically shrink text if over an hour so it doesn't break the circle bounds */}
                  <span className={`${elapsedTime >= 3600 ? 'text-4xl' : 'text-6xl'} font-black text-white tabular-nums tracking-tighter w-full text-center`}>{formatTime(elapsedTime)}</span>
                </div>
                <button onClick={endSession} className="flex items-center gap-2 bg-slate-800 text-white font-bold py-4 px-10 rounded-full border border-slate-700"><Square size={18} className="text-red-400" />End Session</button>
              </div>
            )}
          </div>
        )}

        {/* --- POST SESSION TAGGING --- */}
        {pendingSession && (
          <div className="w-full flex-1 flex flex-col items-center justify-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-teal-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-teal-500/20 text-slate-950"><Trophy size={36} /></div>
            <h2 className="text-3xl font-black mb-2 text-center text-white">Great Job!</h2>
            <p className="text-slate-400 mb-8 text-center text-lg">You stayed away for <span className="text-teal-400 font-bold">{pendingSession.durationMins}</span> minutes.</p>
            
            <div className="w-full max-w-sm">
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 px-1 text-center">How did you spend your time?</p>
              
              {!isCustomTag ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {['Family Time', 'Quiet Time', 'Dinner', 'Exercise', 'Work', 'Friends'].map(cat => (<button key={cat} onClick={() => saveSession(cat)} className="bg-slate-900 border border-slate-800 hover:border-teal-500 text-slate-200 py-4 px-2 rounded-2xl font-semibold flex items-center justify-center gap-2 text-sm transition-colors"><Tag size={16} className="text-teal-500" />{cat}</button>))}
                  </div>
                  <button onClick={() => setIsCustomTag(true)} className="w-full mt-3 bg-slate-900 border border-slate-800 text-slate-400 py-4 rounded-2xl font-semibold flex items-center justify-center gap-2"><Plus size={18} /> Custom Tag</button>
                </>
              ) : (
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 mb-4 animate-in fade-in">
                  <input type="text" value={customTagInput} onChange={e => setCustomTagInput(e.target.value)} placeholder="Enter custom tag..." className="w-full min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white mb-3 focus:outline-none focus:border-teal-500" autoFocus />
                  <div className="flex gap-2">
                    <button onClick={() => setIsCustomTag(false)} className="flex-1 py-3 text-slate-400 font-bold bg-slate-950 rounded-xl border border-slate-800">Back</button>
                    <button onClick={() => { if(customTagInput.trim()) saveSession(customTagInput.trim()); }} className="flex-1 py-3 bg-teal-500 text-slate-950 font-bold rounded-xl">Save</button>
                  </div>
                </div>
              )}

              <div className="mt-8 text-center">
                 <button onClick={() => saveSession('Untagged')} className="text-sm font-bold text-slate-500 hover:text-slate-300 transition-colors border-b border-transparent hover:border-slate-300 pb-1">Skip Tagging</button>
              </div>
            </div>
          </div>
        )}

        {/* --- LEADERBOARD TAB --- */}
        {activeTab === 'leaderboard' && !pendingSession && (
          <div className="w-full animate-in fade-in duration-300">
            <div className="text-center mb-6 mt-4">
              <h2 className="text-2xl font-bold">Weekly Leaderboard</h2>
              <p className="text-slate-400 text-sm mt-1">Total minutes disconnected this week</p>
            </div>

            <div className="flex bg-slate-900 rounded-xl p-1 mb-6 border border-slate-800"><button onClick={() => setBoardView('friends')} className={`flex-1 py-2 text-sm font-bold rounded-lg ${boardView === 'friends' ? 'bg-teal-500 text-slate-950 shadow-sm' : 'text-slate-400'}`}>Friends</button><button onClick={() => setBoardView('global')} className={`flex-1 py-2 text-sm font-bold rounded-lg ${boardView === 'global' ? 'bg-teal-500 text-slate-950 shadow-sm' : 'text-slate-400'}`}>Global</button></div>
            
            <div className="flex flex-col gap-3 mb-8">{leaderboard.filter(u => boardView === 'global' || u.id === user?.uid || (profile.friends || []).includes(u.id)).map((u, i) => (<div key={u.id} className={`bg-slate-900 border rounded-2xl p-4 flex items-center justify-between ${u.id === user?.uid ? 'border-teal-500 shadow-[0_0_15px_-3px_rgba(20,184,166,0.2)]' : 'border-slate-800'}`}><div className="flex items-center gap-4"><div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${i === 0 ? 'bg-yellow-500/20 text-yellow-500' : i === 1 ? 'bg-slate-300/20 text-slate-300' : i === 2 ? 'bg-amber-700/20 text-amber-600' : 'bg-slate-800 text-slate-500'}`}>{i + 1}</div><p className="font-semibold text-slate-200 flex items-center gap-2">{u.displayName || 'Anonymous Explorer'}{u.id === user?.uid && <span className="bg-teal-500/20 text-teal-400 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">You</span>}</p></div><p className="font-bold text-lg text-white">{u.weekTotalMinutes || 0} <span className="text-sm text-slate-400 font-medium">m</span></p></div>))}
            {leaderboard.filter(u => boardView === 'global' || u.id === user?.uid || (profile.friends || []).includes(u.id)).length === 0 && <p className="text-center text-slate-500 mt-6">No activity yet this week.</p>}
            </div>

            <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800">
              <h4 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2"><UserPlus size={18} className="text-teal-400"/> Add a Friend</h4>
              <div className="flex h-12 gap-2">
                <input type="text" value={friendInput} onChange={(e) => setFriendInput(e.target.value.toUpperCase())} maxLength={6} className="flex-1 min-w-0 h-full bg-slate-950 border border-slate-800 rounded-xl px-4 text-white text-center tracking-widest font-mono font-bold uppercase focus:outline-none focus:border-teal-500 transition-colors" placeholder="ENTER CODE" />
                <button onClick={handleAddFriend} className="shrink-0 h-full px-5 bg-teal-500 hover:bg-teal-400 text-slate-950 flex items-center justify-center rounded-xl transition-colors"><Plus size={24} strokeWidth={3} /></button>
              </div>
              {friendMessage.text && <p className={`text-xs mt-3 font-bold text-center ${friendMessage.type === 'error' ? 'text-red-400' : 'text-teal-400'}`}>{friendMessage.text}</p>}
              <div className="mt-6 text-center border-t border-slate-800 pt-6">
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Your Friend Code</p>
                <p className="text-4xl font-mono tracking-widest font-black text-white bg-slate-950 py-3 rounded-xl border-2 border-slate-800 border-dashed select-all">{myFriendCode}</p>
              </div>
            </div>
          </div>
        )}

        {/* --- SETTINGS TAB --- */}
        {activeTab === 'settings' && !pendingSession && (
          <div className="w-full space-y-6 mt-4">
            <h2 className="text-2xl font-bold mb-6">Settings</h2>
            <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800"><label className="text-xs font-bold text-slate-500 uppercase block mb-2">Display Name</label><input type="text" value={profile.displayName} onChange={(e) => setProfile(prev => ({...prev, displayName: e.target.value}))} onBlur={() => updateProfile({ displayName: profile.displayName })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal-500" /></div>
            <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800"><label className="text-xs font-bold text-slate-500 uppercase block mb-2">Daily Goal (Minutes)</label><div className="flex items-center gap-4"><input type="range" min="10" max="240" step="10" value={profile.dailyGoal} onChange={(e) => { const val = parseInt(e.target.value); setProfile(prev => ({...prev, dailyGoal: val})); }} onMouseUp={() => updateProfile({ dailyGoal: profile.dailyGoal })} onTouchEnd={() => updateProfile({ dailyGoal: profile.dailyGoal })} className="flex-1 accent-teal-500" /><span className="font-bold text-xl w-12 text-center text-teal-400">{profile.dailyGoal}</span></div></div>
            <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 flex items-center justify-between"><div><h4 className="font-bold">Strict Mode</h4><p className="text-xs text-slate-400">Ends session if you leave app.</p></div><button onClick={() => updateProfile({ strictMode: !profile.strictMode })} className={`w-14 h-8 rounded-full relative transition-colors ${profile.strictMode ? 'bg-teal-500' : 'bg-slate-700'}`}><div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-transform ${profile.strictMode ? 'translate-x-7' : 'translate-x-1'}`} /></button></div>
            <div className="text-center mt-10 space-y-4"><p className="text-xs text-slate-600">UserID: {user?.uid.substring(0, 8)}...</p><button onClick={handleLogout} className="text-sm font-bold text-red-400 border border-red-500/20 bg-red-500/10 py-3 px-8 rounded-full">Log Out</button></div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-950/80 backdrop-blur-xl border-t border-slate-800/50 pb-safe z-40">
        <div className="flex items-center justify-around p-3 max-w-md mx-auto">
          <button onClick={() => { if(!sessionStart) setActiveTab('home'); }} className={`flex flex-col items-center gap-1 p-2 w-16 ${activeTab === 'home' ? 'text-teal-400' : 'text-slate-500 hover:text-slate-300'}`}>
             <HomeIcon size={24} />
             <span className="text-[10px] font-semibold">Home</span>
          </button>
          
          <button onClick={() => setActiveTab('session')} className="flex items-center justify-center px-4">
             <div className={`w-[76px] h-[76px] rounded-full flex items-center justify-center border-4 border-slate-950 transition-transform ${activeTab === 'session' ? 'bg-teal-400 text-slate-950 scale-105 shadow-[0_0_20px_-5px_rgba(20,184,166,0.5)]' : 'bg-teal-500 text-slate-950 hover:bg-teal-400'}`}>
                <Play size={36} strokeWidth={2.5} className="ml-1" />
             </div>
          </button>

          <button onClick={() => { if(!sessionStart) setActiveTab('leaderboard'); }} className={`flex flex-col items-center gap-1 p-2 w-16 ${activeTab === 'leaderboard' ? 'text-teal-400' : 'text-slate-500 hover:text-slate-300'}`}>
             <Trophy size={24} />
             <span className="text-[10px] font-semibold">Board</span>
          </button>
        </div>
      </div>
    </div>
  );
}