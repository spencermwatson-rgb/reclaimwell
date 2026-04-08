import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';
import { Play, Square, Home as HomeIcon, Trophy, Settings as SettingsIcon, Plus, User, Bell, ChevronRight, Activity, CheckCircle, Tag, UserPlus } from 'lucide-react';

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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'reclaimwell-app';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [loading, setLoading] = useState(true);

  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  // App Data State
  const [profile, setProfile] = useState({ displayName: '', dailyGoal: 60, strictMode: false, friends: [] });
  const [sessions, setSessions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);

  // Session State
  const [sessionStart, setSessionStart] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [pendingSession, setPendingSession] = useState(null); 
  const sessionRef = useRef({ start: null, strictMode: false });

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
    setAuthError('');
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveTab('home');
    } catch (err) {
      console.error("Logout error", err);
    }
  };

  // --- Data Fetching ---
  useEffect(() => {
    if (!user) return;

    // Make user discoverable
    setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'leaderboard', user.uid), {
      friendCode: user.uid.substring(0, 6).toUpperCase(),
      lastActive: Date.now()
    }, { merge: true }).catch(console.error);

    // Fetch Profile
    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data');
    const unsubProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        setProfile((prev) => ({ ...prev, ...docSnap.data() }));
      }
    }, (err) => console.error("Profile fetch error:", err));

    // Fetch Sessions
    const sessionsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'sessions');
    const unsubSessions = onSnapshot(sessionsRef, (snapshot) => {
      const sessData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSessions(sessData);
    }, (err) => console.error("Sessions fetch error:", err));

    // Fetch Leaderboard
    const leaderboardRef = collection(db, 'artifacts', appId, 'public', 'data', 'leaderboard');
    const unsubLeaderboard = onSnapshot(leaderboardRef, (snapshot) => {
      const boardData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      boardData.sort((a, b) => (b.weekTotalMinutes || 0) - (a.weekTotalMinutes || 0));
      setLeaderboard(boardData);
    }, (err) => console.error("Leaderboard fetch error:", err));

    return () => {
      unsubProfile();
      unsubSessions();
      unsubLeaderboard();
    };
  }, [user]);

  // --- Session & Timer Logic ---
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
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setSessionStart(Date.now());
    sendNotification("Session Started", "Put your phone down. We'll keep tracking.");
  };

  const endSession = () => {
    if (!sessionStart) return;
    const durationMins = Math.floor((Date.now() - sessionStart) / 60000);
    setSessionStart(null);
    setPendingSession({ durationMins, timestamp: Date.now() });
    sendNotification("Session Ended", `You were away for ${durationMins} minutes!`);
  };

  const handleAutoEndSession = (durationMins) => {
    setSessionStart(null);
    setPendingSession({ durationMins, timestamp: Date.now(), autoEnded: true });
    sendNotification("Session Auto-Ended", `Strict mode ended your session after ${durationMins} mins.`);
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
      
      const currentWeekTotal = calculateWeekTotal(sessions) + finalDuration;
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'leaderboard', user.uid), {
        displayName: profile.displayName || 'Anonymous Explorer',
        weekTotalMinutes: currentWeekTotal,
        friendCode: myFriendCode,
        lastActive: Date.now()
      }, { merge: true });

      setPendingSession(null);
      setActiveTab('home');
    } catch (err) {
      console.error("Error saving session:", err);
    }
  };

  const updateProfile = async (updates) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
        ...profile,
        ...updates
      }, { merge: true });
      
      if (updates.displayName !== undefined) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'leaderboard', user.uid), {
          displayName: updates.displayName || 'Anonymous Explorer',
          weekTotalMinutes: calculateWeekTotal(sessions),
          friendCode: myFriendCode,
          lastActive: Date.now()
        }, { merge: true });
      }
    } catch (err) {
      console.error("Error saving profile", err);
    }
  };

  const handleAddFriend = () => {
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
        updateProfile({ friends: [...currentFriends, friend.id] });
        setFriendMessage({ text: "Added " + (friend.displayName || 'New Friend') + "!", type: 'success' });
        setFriendInput('');
      }
    } else {
      setFriendMessage({ text: "Friend code not found.", type: 'error' });
    }
    setTimeout(() => setFriendMessage({ text: '', type: '' }), 3000);
  };

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
    if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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
        <div className="absolute flex flex-col items-center justify-center text-center">{children}</div>
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

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-teal-400">Loading...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
        <div className="w-full max-w-md bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <img src="/icon-192x192.png" alt="Logo" className="w-16 h-16 rounded-2xl mb-4 shadow-lg shadow-teal-500/20" />
            <h1 className="text-2xl font-black text-white">Reclaimwell</h1>
            <p className="text-slate-400 text-sm mt-1">{isSignUp ? 'Create an account to start tracking' : 'Welcome back, ready to disconnect?'}</p>
          </div>
          {authError && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 text-red-400 text-xs rounded-xl text-center">{authError}</div>}
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal-500" placeholder="Email" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength="6" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal-500" placeholder="Password" />
            <div className="pt-2 space-y-3">
              <button type="submit" className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-lg py-3 rounded-xl">{isSignUp ? 'Create Account' : 'Log In'}</button>
              <div className="relative flex items-center py-2"><div className="flex-grow border-t border-slate-800"></div><span className="mx-4 text-slate-500 text-xs uppercase font-medium">Or</span><div className="flex-grow border-t border-slate-800"></div></div>
              <button type="button" onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }} className="w-full bg-transparent border-2 border-slate-800 text-slate-300 font-bold text-lg py-3 rounded-xl">{isSignUp ? 'Log in to existing account' : 'Create a new account'}</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 flex flex-col">
      <div className="pt-12 pb-4 px-6 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <img src="/icon-192x192.png" alt="Logo" className="w-8 h-8 rounded-lg" />
          <h1 className="text-xl font-bold tracking-tight text-white">Reclaimwell</h1>
        </div>
        <button onClick={() => { if(!sessionStart) setActiveTab('settings'); }} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${activeTab === 'settings' ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}><SettingsIcon size={16} /></button>
      </div>

      <main className="flex-1 px-6 overflow-y-auto flex flex-col items-center">
        {activeTab === 'home' && !pendingSession && (
          <div className="w-full flex flex-col items-center animate-in fade-in duration-500">
            <div className="mt-8 mb-4"><CircularProgress progress={progressPercentage}><span className="text-5xl font-black text-white mb-1">{todayTotal}</span><span className="text-sm font-medium text-slate-400 uppercase tracking-widest">Mins Today</span></CircularProgress></div>
            <WeeklyProgress />
            <div className="w-full mt-10"><h3 className="text-lg font-bold mb-4">Recent Breaks</h3><div className="flex flex-col gap-3">{sessions.length === 0 ? <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center text-slate-500">No breaks recorded today.</div> : sessions.filter(s => s.timestamp >= todayStart).sort((a,b) => b.timestamp - a.timestamp).map(s => (<div key={s.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between"><div className="flex items-center gap-4"><div className="w-10 h-10 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center"><CheckCircle size={20} /></div><div><p className="font-semibold text-slate-200">{s.category}</p><p className="text-xs text-slate-500">{new Date(s.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p></div></div><p className="font-bold text-lg text-white">{s.durationMins}m</p></div>))}</div></div>
          </div>
        )}

        {activeTab === 'session' && !pendingSession && (
          <div className="w-full flex-1 flex flex-col items-center justify-center">
            {!sessionStart ? (
              <div className="text-center flex flex-col items-center">
                <div className="w-24 h-24 bg-teal-500/20 rounded-full flex items-center justify-center mb-6 animate-pulse"><Activity className="text-teal-400" size={40} /></div>
                <h2 className="text-3xl font-black mb-3">Ready?</h2>
                <button onClick={startSession} className="bg-teal-500 text-slate-950 font-bold text-xl py-5 px-12 rounded-full shadow-lg">Start Session</button>
              </div>
            ) : (
              <div className="text-center flex flex-col items-center">
                <div className="w-64 h-64 border-4 border-teal-500/30 rounded-full flex flex-col items-center justify-center mb-12 bg-slate-950 shadow-2xl">
                  <span className="text-xs font-bold text-teal-400 uppercase mb-2">Time Away</span>
                  <span className="text-6xl font-black text-white tabular-nums">{formatTime(elapsedTime)}</span>
                </div>
                <button onClick={endSession} className="flex items-center gap-2 bg-slate-800 text-white font-bold py-4 px-10 rounded-full"><Square size={18} className="text-red-400" />End Session</button>
              </div>
            )}
          </div>
        )}

        {pendingSession && (
          <div className="w-full flex-1 flex flex-col items-center justify-center">
            <h2 className="text-3xl font-black mb-8 text-white">Great Job!</h2>
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              {['Family Time', 'Quiet Time', 'Dinner', 'Exercise', 'Work', 'Friends'].map(cat => (<button key={cat} onClick={() => saveSession(cat)} className="bg-slate-900 border border-slate-800 text-slate-200 py-4 rounded-2xl font-semibold flex items-center justify-center gap-2"><Tag size={16} className="text-teal-500" />{cat}</button>))}
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && !pendingSession && (
          <div className="w-full animate-in fade-in duration-300">
            <h2 className="text-2xl font-bold mb-6 text-center mt-4">Board</h2>
            <div className="flex bg-slate-900 rounded-xl p-1 mb-6"><button onClick={() => setBoardView('friends')} className={`flex-1 py-2 text-sm font-bold rounded-lg ${boardView === 'friends' ? 'bg-teal-500 text-slate-950' : 'text-slate-400'}`}>Friends</button><button onClick={() => setBoardView('global')} className={`flex-1 py-2 text-sm font-bold rounded-lg ${boardView === 'global' ? 'bg-teal-500 text-slate-950' : 'text-slate-400'}`}>Global</button></div>
            <div className="flex flex-col gap-3 mb-8">{leaderboard.filter(u => boardView === 'global' || u.id === user?.uid || (profile.friends || []).includes(u.id)).map((u, i) => (<div key={u.id} className={`bg-slate-900 border rounded-2xl p-4 flex items-center justify-between ${u.id === user?.uid ? 'border-teal-500' : 'border-slate-800'}`}><p className="font-semibold">{u.displayName || 'Anon'}</p><p className="font-bold">{u.weekTotalMinutes || 0}m</p></div>))}</div>
            <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800"><h4 className="text-sm font-bold mb-3 flex items-center gap-2"><UserPlus size={16} /> Add Friend</h4><div className="flex gap-2"><input type="text" value={friendInput} onChange={(e) => setFriendInput(e.target.value.toUpperCase())} maxLength={6} className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-center tracking-widest font-mono" placeholder="CODE" /><button onClick={handleAddFriend} className="bg-teal-500 text-slate-950 font-bold px-6 rounded-xl">Add</button></div>{friendMessage.text && <p className={`text-xs mt-3 font-bold text-center ${friendMessage.type === 'error' ? 'text-red-400' : 'text-teal-400'}`}>{friendMessage.text}</p>}<p className="text-xs text-slate-500 mt-4 text-center font-bold uppercase tracking-widest">Your Code: {myFriendCode}</p></div>
          </div>
        )}

        {activeTab === 'settings' && !pendingSession && (
          <div className="w-full space-y-6 mt-4">
            <h2 className="text-2xl font-bold">Settings</h2>
            <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800"><label className="text-xs font-bold text-slate-500 uppercase block mb-2">Display Name</label><input type="text" value={profile.displayName} onChange={(e) => setProfile(prev => ({...prev, displayName: e.target.value}))} onBlur={() => updateProfile({ displayName: profile.displayName })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white" /></div>
            <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 flex items-center justify-between"><div><h4 className="font-bold">Strict Mode</h4><p className="text-xs text-slate-400">Ends session if you leave app.</p></div><button onClick={() => updateProfile({ strictMode: !profile.strictMode })} className={`w-14 h-8 rounded-full relative transition-colors ${profile.strictMode ? 'bg-teal-500' : 'bg-slate-700'}`}><div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-transform ${profile.strictMode ? 'translate-x-7' : 'translate-x-1'}`} /></button></div>
            <button onClick={handleLogout} className="w-full py-4 text-red-400 font-bold bg-red-500/10 border border-red-500/20 rounded-2xl">Log Out</button>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-slate-950/80 backdrop-blur-xl border-t border-slate-800/50">
        <div className="flex items-center justify-around p-3 max-w-md mx-auto">
          <button onClick={() => { if(!sessionStart) setActiveTab('home'); }} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'home' ? 'text-teal-400' : 'text-slate-500'}`}><HomeIcon size={24} /><span className="text-[10px] font-semibold">Home</span></button>
          <button onClick={() => setActiveTab('session')} className="flex flex-col items-center justify-center -mt-6"><div className={`w-16 h-16 rounded-full flex items-center justify-center border-4 border-slate-950 bg-teal-400 text-slate-950 shadow-lg`}><Play size={28} strokeWidth={2.5} className="ml-0.5" /></div><span className={`text-[10px] font-bold mt-1 ${activeTab === 'session' ? 'text-teal-400' : 'text-slate-500'}`}>Go Aro</span></button>
          <button onClick={() => { if(!sessionStart) setActiveTab('leaderboard'); }} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'leaderboard' ? 'text-teal-400' : 'text-slate-500'}`}><Trophy size={24} /><span className="text-[10px] font-semibold">Board</span></button>
        </div>
      </div>
    </div>
  );
}