import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  updateDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { 
  Calendar, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Download, 
  Upload, 
  Trash2,
  X,
  User,
  Lock,
  LogIn,
  Edit2,
  Save,
  Info,
  ArrowLeft,
  ShieldCheck,
  Bold,
  Heading,
  LogOut
} from 'lucide-react';

// --- VIKTIG: HER SKAL DU LIME INN DIN EGEN FIREBASE INFO ---
const firebaseConfig = {
  apiKey: "AIzaSyBXz3FVe7VSLRj714AWunWvNY4eIv1mFoI",
  authDomain: "molde-dugnad.firebaseapp.com",
  projectId: "molde-dugnad",
  storageBucket: "molde-dugnad.firebasestorage.app",
  messagingSenderId: "1050721788396",
  appId: "1:1050721788396:web:6569905a75f397a559e0c9"
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Navn på samlingen i databasen
const COLLECTION_PATH = "dugnad_vaktliste"; 

// --- Hjelpefunksjoner for Dato ---

const parseDateToIso = (inputDate: string): string => {
  const cleanDate = inputDate.trim();
  if (cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) return cleanDate;
  
  const parts = cleanDate.split(/[.-]/);
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    if (year.length === 4) return `${year}-${month}-${day}`;
  }
  return cleanDate;
};

const formatDateDisplay = (isoDate: string): string => {
  if (!isoDate) return "";
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return isoDate;
};

// --- Rich Text Hjelper ---
const RichTextDisplay = ({ content }: { content: string }) => {
  if (!content) return null;

  const lines = content.split('\n');

  return (
    <div className="space-y-2 text-sm text-slate-600 leading-relaxed">
      {lines.map((line, index) => {
        if (line.startsWith('# ')) {
          return <h3 key={index} className="text-lg font-bold text-slate-800 mt-6 mb-2">{line.replace('# ', '')}</h3>;
        }
        
        const parts = line.split(/(\*[^*]+\*)/g);
        
        return (
          <p key={index} className="min-h-[1.2em]">
            {parts.map((part, i) => {
              if (part.startsWith('*') && part.endsWith('*')) {
                return <strong key={i} className="font-bold text-slate-800">{part.slice(1, -1)}</strong>;
              }
              return part;
            })}
          </p>
        );
      })}
    </div>
  );
};

// --- Typer ---
type Player = {
  id: string;
  name: string;
  username: string; 
  password: string; 
  team?: string;
};

type Match = {
  id: string;
  date: string;
  time: string;
  opponent: string;
  league: string; 
  logoColor?: string;
  requiredSlots: number;
  bookedBy: string[];
};

// --- Komponenter ---

const App = () => {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'matches' | 'admin' | 'info'>('matches');
  const [currentUserProfile, setCurrentUserProfile] = useState<Player | null>(null);
  const [isAdmin, setIsAdmin] = useState(false); // Ny state for admin
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [infoText, setInfoText] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Logg inn anonymt mot Firebase
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error: any) {
        console.error("Feil ved innlogging:", error);
        if (error.code === 'auth/api-key-not-valid' || firebaseConfig.apiKey === "LIM_INN_API_KEY_HER") {
            setErrorMsg("Mangler API Key! Du må bytte ut placeholder-teksten øverst i App.tsx med din egen config fra Firebase.");
        } else if (error.code === 'auth/operation-not-allowed') {
            setErrorMsg("Anonym innlogging er ikke aktivert i Firebase Console (Authentication -> Sign-in method).");
        } else {
            setErrorMsg("Kunne ikke koble til databasen: " + error.message);
        }
        setLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Hent data
  useEffect(() => {
    if (!user) return;

    const qPlayers = query(collection(db, COLLECTION_PATH, 'public', 'players'));
    const unsubPlayers = onSnapshot(qPlayers, (snapshot) => {
      const pList: Player[] = [];
      snapshot.forEach(doc => pList.push({ id: doc.id, ...doc.data() } as Player));
      setPlayers(pList.sort((a, b) => a.name.localeCompare(b.name)));
    }, (err) => {
        console.error("Feil ved henting av spillere", err);
        setErrorMsg("Kunne ikke hente spillere. Sjekk at 'Test Mode' er på i Firestore Rules.");
    });

    const qMatches = query(collection(db, COLLECTION_PATH, 'public', 'matches'));
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      const mList: Match[] = [];
      snapshot.forEach(doc => mList.push({ id: doc.id, ...doc.data() } as Match));
      const sortedMatches = mList.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateA.getTime() - dateB.getTime();
      });
      setMatches(sortedMatches);
      setLoading(false);
    }, (err) => console.error("Feil ved henting av kamper", err));

    const infoRef = doc(db, COLLECTION_PATH, 'public', 'info', 'general');
    const unsubInfo = onSnapshot(infoRef, (doc) => {
        if (doc.exists()) {
            setInfoText(doc.data().content || '');
        } else {
            setInfoText("# Velkommen til dugnad!\n\nHer kommer informasjon om regler og fordeling av vakter.\n\n# Viktig info\nHusk oppmøte 1 time før kampstart.");
        }
    });

    return () => {
      unsubPlayers();
      unsubMatches();
      unsubInfo();
    };
  }, [user]);

  // Håndter bruker-profil
  const handleLogin = (player: Player) => {
    setCurrentUserProfile(player);
    localStorage.setItem('kiosk_user_id', player.id);
  };

  const handleAdminLogin = () => {
    setIsAdmin(true);
    setActiveTab('admin'); // Gå rett til admin-panelet
  };

  const handleLogout = () => {
    setCurrentUserProfile(null);
    setIsAdmin(false);
    localStorage.removeItem('kiosk_user_id');
    setActiveTab('matches');
  };

  // Auto-login
  useEffect(() => {
    const storedId = localStorage.getItem('kiosk_user_id');
    if (storedId && players.length > 0 && !currentUserProfile) {
      const found = players.find(p => p.id === storedId);
      if (found) setCurrentUserProfile(found);
    }
  }, [players]);

  // Booke / Avbooke
  const toggleBooking = async (matchId: string) => {
    if (!currentUserProfile) return;
    
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const isBooked = match.bookedBy.includes(currentUserProfile.id);
    const matchRef = doc(db, COLLECTION_PATH, 'public', 'matches', matchId);

    try {
      if (isBooked) {
        await updateDoc(matchRef, { bookedBy: arrayRemove(currentUserProfile.id) });
      } else {
        if (match.bookedBy.length >= match.requiredSlots) {
          setErrorMsg("Denne vakten er dessverre full.");
          setTimeout(() => setErrorMsg(null), 3000);
          return;
        }
        await updateDoc(matchRef, { bookedBy: arrayUnion(currentUserProfile.id) });
      }
    } catch (e) {
      console.error("Booking failed", e);
      setErrorMsg("Noe gikk galt. Sjekk at Database Rules i Firebase tillater skriving.");
    }
  };

  if (loading || errorMsg) return (
    <div className="flex flex-col h-screen items-center justify-center bg-blue-50 text-blue-800 p-4 text-center">
      <div className="flex flex-col items-center max-w-md">
        <img src="/Molde.png" alt="MFK Logo" className="w-20 h-20 mb-4 object-contain" />
        {errorMsg ? (
            <div className="bg-white p-6 rounded-lg shadow-xl border-l-4 border-red-500">
                <h3 className="text-red-600 font-bold text-lg mb-2 flex items-center justify-center gap-2">
                    <AlertCircle className="w-5 h-5" /> Noe gikk galt
                </h3>
                <p className="text-slate-600 mb-4">{errorMsg}</p>
            </div>
        ) : (
            <>
                <p className="font-semibold">Laster MFK Dugnadsliste...</p>
                <p className="text-xs text-slate-500 mt-2">(Venter på database-tilkobling...)</p>
            </>
        )}
      </div>
    </div>
  );

  // --- INFO SCREEN ---
  if (activeTab === 'info') {
      return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
            <header className="bg-blue-700 text-white shadow-lg sticky top-0 z-10 border-b-4 border-white">
                <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
                    <button onClick={() => setActiveTab('matches')} className="p-1 hover:bg-blue-600 rounded-full transition">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-xl font-bold tracking-tight">Informasjon</h1>
                </div>
            </header>
            <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
                <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
                    <RichTextDisplay content={infoText} />
                </div>
                <div className="bg-slate-100 p-6 rounded-xl border border-slate-200">
                    <h3 className="text-md font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-green-600" /> Personvern (GDPR)
                    </h3>
                    <p className="text-sm text-slate-500 mb-2">
                        Vi tar personvern på alvor. Her er en oversikt over hvordan vi behandler dine data:
                    </p>
                    <ul className="text-sm text-slate-500 list-disc list-inside space-y-1 ml-1">
                        <li>Dine opplysninger (navn, brukernavn) lagres kun for å administrere dugnadslisten.</li>
                        <li>Listen er passordbeskyttet og kun tilgjengelig for registrerte spillere og dugnadsansvarlig.</li>
                        <li>Ingen data deles med tredjeparter utenfor klubben.</li>
                        <li><strong>Alle data slettes permanent</strong> ved sesongslutt eller når dugnadslisten nullstilles.</li>
                    </ul>
                </div>
                <div className="text-center pt-4">
                    <button onClick={() => setActiveTab('matches')} className="text-blue-600 font-semibold hover:underline">
                        Tilbake til terminlisten
                    </button>
                </div>
            </main>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* Header */}
      <header className="bg-blue-700 text-white shadow-lg sticky top-0 z-10 border-b-4 border-white">
        <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white p-1 rounded-full shadow-sm">
                <img src="/Molde.png" alt="MFK" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Kioskvakt J14</h1>
              <p className="text-xs text-blue-200 uppercase tracking-wider font-semibold">Aker Stadion</p>
            </div>
          </div>
          
          <div className="flex gap-2">
             {currentUserProfile && !isAdmin && (
               <div className="hidden sm:flex flex-col items-end mr-3 border-r border-blue-500 pr-4">
                 <span className="text-sm font-bold text-white">{currentUserProfile.name}</span>
                 <span className="text-xs text-blue-200">
                   {matches.filter(m => m.bookedBy.includes(currentUserProfile.id)).length} / 3 vakter
                 </span>
               </div>
             )}
             {isAdmin && (
               <div className="hidden sm:flex flex-col items-end mr-3 border-r border-blue-500 pr-4">
                 <span className="text-sm font-bold text-white">Administrator</span>
               </div>
             )}
            <div className="flex bg-blue-800 rounded p-1">
              <button onClick={() => setActiveTab('matches')} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === 'matches' ? 'bg-white text-blue-800 shadow-sm' : 'text-blue-200 hover:text-white'}`}>Kamper</button>
              
              {/* Tydeligere INFO knapp */}
              <button 
                onClick={() => setActiveTab('info')} 
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === 'info' ? 'bg-white text-blue-800 shadow-sm' : 'text-blue-200 hover:text-white'}`} 
                title="Informasjon"
              >
                <Info className="w-4 h-4" />
                <span className="hidden xs:inline">Info</span>
              </button>

              {/* Admin knapp - KUN synlig hvis logget inn som admin */}
              {isAdmin && (
                <button onClick={() => setActiveTab('admin')} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === 'admin' ? 'bg-white text-blue-800 shadow-sm' : 'text-blue-200 hover:text-white'}`}>Admin</button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Error Toast */}
      {errorMsg && !loading && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 bg-red-100 border-l-4 border-red-600 text-red-800 px-6 py-4 rounded shadow-2xl z-50 flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <p className="font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {activeTab === 'matches' ? (
          <>
            {!currentUserProfile && !isAdmin ? (
              <LoginScreen players={players} onLogin={handleLogin} onAdminLogin={handleAdminLogin} />
            ) : (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 rounded-xl shadow-md text-white flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">Hei, {isAdmin ? "Admin" : currentUserProfile?.name}! 👋</h2>
                    <p className="text-blue-100 opacity-90">{isAdmin ? "Du er i administrasjonsmodus." : "Klar for innsats? Velg dine 3 vakter under."}</p>
                  </div>
                  <button onClick={handleLogout} className="bg-blue-900 bg-opacity-40 hover:bg-opacity-60 text-white px-4 py-2 rounded transition text-sm font-medium">Logg ut</button>
                </div>
                <div className="grid gap-4 md:grid-cols-1">
                  {matches.map(match => (
                    <MatchCard key={match.id} match={match} players={players} currentUser={currentUserProfile} onToggle={() => toggleBooking(match.id)} />
                  ))}
                </div>
                {matches.length === 0 && (
                  <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-slate-100">
                    <Calendar className="w-8 h-8 text-blue-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-700">Ingen kamper</h3>
                    <p className="text-slate-400">Databasen er tom. Gå til Admin for å laste opp.</p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          // Admin-panelet vises automatisk hvis activeTab er 'admin', som settes ved login
          <AdminPanel matches={matches} players={players} initialInfo={infoText} onLogout={handleLogout} />
        )}
      </main>
    </div>
  );
};

// --- Under-komponenter ---

const LoginScreen = ({ players, onLogin, onAdminLogin }: { players: Player[], onLogin: (player: Player) => void, onAdminLogin: () => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Sjekk om det er admin-login først
    if (username === 'admin' && password === 'F2026pwpx') {
        onAdminLogin();
        return;
    }

    if (players.length === 0) {
      setError('Ingen spillere i databasen.');
      return;
    }

    const found = players.find(p => 
      p.username.toLowerCase().trim() === username.toLowerCase().trim() && 
      p.password.trim() === password.trim()
    );

    if (found) {
      setError('');
      onLogin(found);
    } else {
      setError('Feil brukernavn eller passord');
    }
  };

  return (
    <div className="bg-white p-8 rounded-xl shadow-xl max-w-sm mx-auto mt-10 text-center border-t-8 border-blue-600">
      <img src="/Molde.png" alt="MFK Logo" className="w-24 h-24 mx-auto mb-6 object-contain" />
      <h2 className="text-2xl font-bold mb-2 text-slate-800">Velkommen</h2>
      <p className="text-slate-500 mb-6">Logg inn for å velge vakter</p>
      
      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Brukernavn</label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Ditt brukernavn"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Passord</label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
            <input 
              type="password" 
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Ditt passord"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm font-medium text-center">{error}</p>}

        <button 
          type="submit"
          className="w-full bg-blue-600 text-white py-2.5 rounded font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2"
        >
          <LogIn className="w-4 h-4" /> Logg inn
        </button>
      </form>
    </div>
  );
};

const MatchCard = ({ match, players, currentUser, onToggle }: { match: Match, players: Player[], currentUser: Player | null, onToggle: () => void }) => {
  const dateObj = new Date(match.date);
  const isBookedByMe = currentUser ? match.bookedBy.includes(currentUser.id) : false;
  const isFull = match.bookedBy.length >= match.requiredSlots;
  const availableSlots = match.requiredSlots - match.bookedBy.length;

  return (
    <div className={`relative bg-white rounded-xl shadow-sm border overflow-hidden transition-all duration-200 ${isBookedByMe ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/30' : 'border-slate-200 hover:border-blue-300'}`}>
      {isBookedByMe && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>}
      <div className="p-5 flex flex-col md:flex-row gap-6">
        <div className="flex-shrink-0 w-full md:w-28 flex flex-row md:flex-col justify-between md:justify-center items-center bg-slate-50 md:bg-transparent rounded-lg p-3 md:p-0 border md:border-0 border-slate-100">
          <div className="text-center">
            <span className="text-xs uppercase font-bold text-blue-600 block mb-1">{dateObj.toLocaleDateString('no-NO', { weekday: 'long' })}</span>
            <span className="text-3xl font-black text-slate-800 leading-none">{dateObj.getDate()}</span>
            <span className="text-sm font-medium text-slate-500 block mt-1">{dateObj.toLocaleDateString('no-NO', { month: 'short' })}.</span>
          </div>
          <div className="md:mt-3 flex items-center gap-1.5 text-slate-600 bg-white md:bg-slate-100 px-3 py-1 rounded-full text-xs font-bold border border-slate-200 md:border-transparent">
            <Clock className="w-3.5 h-3.5" /> {match.time}
          </div>
        </div>
        <div className="flex-grow flex flex-col justify-center">
          <div className="flex items-center gap-4 mb-4">
             <div>
               <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-0.5">{match.league || 'Eliteserien'}</p>
               <h3 className="text-xl font-bold text-slate-800">MFK <span className="text-slate-300 font-light mx-1">vs</span> {match.opponent}</h3>
             </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Bemanning ({match.bookedBy.length}/{match.requiredSlots})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: match.requiredSlots }).map((_, idx) => {
                const playerId = match.bookedBy[idx];
                const player = playerId ? players.find(p => p.id === playerId) : null;
                const isMe = currentUser && player?.id === currentUser.id;
                return (
                  <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${player ? (isMe ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-50 border-blue-200 text-blue-900') : 'bg-white border-dashed border-slate-300 text-slate-400'}`}>
                    <User className={`w-3.5 h-3.5 ${isMe ? 'text-white' : ''}`} />
                    <span className="font-medium">{player ? (isMe ? 'Meg' : player.name.split(' ')[0]) : 'Ledig'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-center items-center md:items-end min-w-[150px] border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
          {currentUser ? (
            isBookedByMe ? (
              <button onClick={onToggle} className="w-full flex items-center justify-center gap-2 bg-white text-red-600 hover:bg-red-50 border border-red-200 py-2.5 px-4 rounded-lg font-semibold text-sm shadow-sm"><X className="w-4 h-4" /> Meld avbud</button>
            ) : (
              <button onClick={onToggle} disabled={isFull} className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm shadow-md ${isFull ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>{isFull ? 'Fullbooket' : <><CheckCircle className="w-4 h-4" /> Ta vakten</>}</button>
            )
          ) : (
            <span className="text-xs text-slate-400 italic">Logg inn for å booke</span>
          )}
          {availableSlots > 0 && !isFull && <span className="text-xs text-blue-600 mt-2 font-medium bg-blue-50 px-2 py-0.5 rounded">{availableSlots} ledige plasser</span>}
        </div>
      </div>
    </div>
  );
};

// --- Edit Match Komponent ---
const EditMatchRow = ({ match, onSave, onCancel }: { match: Match, onSave: (m: Match) => void, onCancel: () => void }) => {
  const [edited, setEdited] = useState(match);

  const handleChange = (field: keyof Match, value: any) => {
    setEdited({ ...edited, [field]: value });
  };

  return (
    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-2">
      <h4 className="font-bold text-sm mb-3 text-blue-800">Rediger kamp</h4>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        <div>
          <label className="text-[10px] uppercase text-slate-500 font-bold">Dato</label>
          <input type="date" value={edited.date} onChange={(e) => handleChange('date', e.target.value)} className="w-full p-2 border rounded text-sm" />
        </div>
        <div>
          <label className="text-[10px] uppercase text-slate-500 font-bold">Tid</label>
          <input type="time" value={edited.time} onChange={(e) => handleChange('time', e.target.value)} className="w-full p-2 border rounded text-sm" />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase text-slate-500 font-bold">Motstander</label>
          <input type="text" value={edited.opponent} onChange={(e) => handleChange('opponent', e.target.value)} className="w-full p-2 border rounded text-sm" />
        </div>
        <div>
          <label className="text-[10px] uppercase text-slate-500 font-bold">Vakter</label>
          <input type="number" value={edited.requiredSlots} onChange={(e) => handleChange('requiredSlots', parseInt(e.target.value))} className="w-full p-2 border rounded text-sm" />
        </div>
        <div className="md:col-span-5">
          <label className="text-[10px] uppercase text-slate-500 font-bold">Liga / Turnering</label>
          <input type="text" value={edited.league} onChange={(e) => handleChange('league', e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="F.eks. Eliteserien" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 bg-white border rounded text-sm font-medium text-slate-600 hover:bg-slate-50">Avbryt</button>
        <button onClick={() => onSave(edited)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 flex items-center gap-1"><Save className="w-4 h-4" /> Lagre endringer</button>
      </div>
    </div>
  );
};

const AdminPanel = ({ matches, players, initialInfo, onLogout }: { matches: Match[], players: Player[], initialInfo: string, onLogout: () => void }) => {
  // AdminPanel trenger ikke lenger lokal login siden vi logger inn via hovedskjermen
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'matches' | 'players'>('matches');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [adminInfoText, setAdminInfoText] = useState(initialInfo);
  const [infoSaved, setInfoSaved] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setAdminInfoText(initialInfo); }, [initialInfo]);

  const handleImport = async () => {
    setLoading(true); setMsg('');
    try {
      const lines = importText.trim().split('\n');
      const batch = writeBatch(db);
      let count = 0;
      
      if (importMode === 'players') {
        lines.forEach((line) => {
           const parts = line.split(',');
           if (parts.length >= 3) {
             const name = parts[0].trim();
             const username = parts[1].trim();
             const password = parts[2].trim();
             
             if (name && username && password) {
               const id = 'p_' + Math.random().toString(36).substr(2, 9);
               batch.set(doc(db, COLLECTION_PATH, 'public', 'players', id), { 
                 id, name, username, password 
               });
               count++;
             }
           }
        });
      } else {
        lines.forEach((line) => {
          const parts = line.split(',');
          if (parts.length >= 3) {
            let slots = parts[3] ? parseInt(parts[3].trim()) : 3;
            if (slots > 10) slots = 10;
            const league = parts[4] ? parts[4].trim() : "Eliteserien";
            const id = 'm_' + Math.random().toString(36).substr(2, 9);
            const colors = ['bg-red-600', 'bg-blue-600', 'bg-yellow-500', 'bg-black', 'bg-green-700', 'bg-purple-600'];
            batch.set(doc(db, COLLECTION_PATH, 'public', 'matches', id), {
              id, 
              date: parseDateToIso(parts[0]),
              time: parts[1].trim(), 
              opponent: parts[2].trim(), 
              requiredSlots: slots, 
              league, 
              bookedBy: [], 
              logoColor: colors[Math.floor(Math.random() * colors.length)]
            });
            count++;
          }
        });
      }
      await batch.commit();
      setMsg(`Importerte ${count} ${importMode === 'players' ? 'spillere' : 'kamper'}.`); setImportText('');
    } catch (e) { console.error(e); setMsg("Feil under import. Sjekk formatet."); }
    setLoading(false);
  };

  const handleUpdateMatch = async (updatedMatch: Match) => {
    try {
      const matchRef = doc(db, COLLECTION_PATH, 'public', 'matches', updatedMatch.id);
      await updateDoc(matchRef, {
        date: updatedMatch.date,
        time: updatedMatch.time,
        opponent: updatedMatch.opponent,
        league: updatedMatch.league,
        requiredSlots: updatedMatch.requiredSlots
      });
      setEditingId(null);
    } catch (e) {
      console.error("Update failed", e);
      alert("Kunne ikke oppdatere kampen.");
    }
  };

  const handleDeleteMatch = async (match: Match) => {
    const confirmMsg = match.bookedBy.length > 0 
      ? `Advarsel: ${match.bookedBy.length} spillere har allerede booket denne kampen. Hvis du sletter den, vil bookingen deres forsvinne. Er du sikker?`
      : "Er du sikker på at du vil slette denne kampen?";
      
    if (window.confirm(confirmMsg)) {
      try {
        await deleteDoc(doc(db, COLLECTION_PATH, 'public', 'matches', match.id));
      } catch (e) {
        console.error("Delete failed", e);
        alert("Kunne ikke slette kampen.");
      }
    }
  };

  const handleSaveInfo = async () => {
      try {
          const infoRef = doc(db, COLLECTION_PATH, 'public', 'info', 'general');
          await setDoc(infoRef, { content: adminInfoText }, { merge: true });
          setInfoSaved(true);
          setTimeout(() => setInfoSaved(false), 3000);
      } catch (e) {
          console.error("Save info failed", e);
          alert("Kunne ikke lagre informasjon.");
      }
  };

  // Funksjon for å sette inn tegn i tekstboksen
  const insertAtCursor = (char: string, wrap = false) => {
    if (!textAreaRef.current) return;
    
    const start = textAreaRef.current.selectionStart;
    const end = textAreaRef.current.selectionEnd;
    const text = adminInfoText;
    let newText = "";
    
    if (wrap) {
      // For fet tekst (wrap selection)
      const selected = text.substring(start, end);
      newText = text.substring(0, start) + `*${selected}*` + text.substring(end);
    } else {
      // For overskrift (insert at start of line)
      // Finner starten av linjen vi står på
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      newText = text.substring(0, lineStart) + char + text.substring(lineStart);
    }
    
    setAdminInfoText(newText);
    textAreaRef.current.focus();
  };

  const handleClearAll = async () => {
    if (!window.confirm("Slett ALT?")) return;
    setLoading(true);
    const batch = writeBatch(db);
    matches.forEach(m => batch.delete(doc(db, COLLECTION_PATH, 'public', 'matches', m.id)));
    players.forEach(p => batch.delete(doc(db, COLLECTION_PATH, 'public', 'players', p.id)));
    await batch.commit();
    setLoading(false); setMsg("Databasen er tømt.");
  }

  const handleExport = () => {
    let csv = "Dato,Tid,Motstander,Vakt 1, Vakt 2, Vakt 3\n";
    matches.forEach(m => {
      const bookers = m.bookedBy.map(id => players.find(p => p.id === id)?.name || "Ukjent");
      while(bookers.length < m.requiredSlots) bookers.push("Ledig");
      csv += [m.date, m.time, m.opponent, ...bookers].join(",") + "\n";
    });
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = "dugnad.csv";
    link.click();
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Administrasjon</h2>
        <button onClick={onLogout} className="bg-slate-200 text-slate-700 px-4 py-2 rounded text-sm hover:bg-slate-300 font-medium flex items-center gap-2">
            <LogOut className="w-4 h-4" /> Logg ut
        </button>
      </div>
      
      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button onClick={handleExport} className="flex items-center justify-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 text-blue-800"><Download className="w-5 h-5" /> Eksportér (CSV)</button>
        <button onClick={handleClearAll} className="flex items-center justify-center gap-2 p-4 bg-red-50 border border-red-200 rounded hover:bg-red-100 text-red-700"><Trash2 className="w-5 h-5" /> Slett alt</button>
      </div>

      <hr className="border-slate-100" />

      {/* Info Editor */}
      <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Rediger Informasjonsside</h3>
          <p className="text-sm text-slate-500 mb-2">Bruk knappene for å formatere teksten. GDPR-informasjon legges til automatisk nederst.</p>
          
          <div className="flex gap-2 mb-2">
            <button onClick={() => insertAtCursor('# ', false)} className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-sm font-medium border border-slate-300 transition">
              <Heading className="w-4 h-4" /> Overskrift
            </button>
            <button onClick={() => insertAtCursor('*', true)} className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-sm font-medium border border-slate-300 transition">
              <Bold className="w-4 h-4" /> Fet tekst
            </button>
          </div>

          <textarea 
            ref={textAreaRef}
            className="w-full h-40 border border-slate-300 rounded p-3 text-sm mb-2 font-mono" 
            value={adminInfoText} 
            onChange={(e) => setAdminInfoText(e.target.value)} 
            placeholder="Skriv regler her..."
          />
          <button onClick={handleSaveInfo} className="bg-slate-800 text-white px-4 py-2 rounded text-sm hover:bg-slate-700 flex items-center gap-2">
              <Save className="w-4 h-4" /> Lagre Informasjon
          </button>
          {infoSaved && <span className="text-green-600 text-sm ml-3 font-medium">Lagret!</span>}
      </div>

      <hr className="border-slate-100" />

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">Importer data</h3>
        <div className="flex gap-4 mb-2">
          <button onClick={() => { setImportMode('matches'); setImportText(''); }} className={`px-4 py-2 rounded text-sm font-medium transition ${importMode === 'matches' ? 'bg-blue-700 text-white' : 'bg-slate-100'}`}>Kamper</button>
          <button onClick={() => { setImportMode('players'); setImportText(''); }} className={`px-4 py-2 rounded text-sm font-medium transition ${importMode === 'players' ? 'bg-blue-700 text-white' : 'bg-slate-100'}`}>Spillere</button>
        </div>
        <p className="text-sm text-slate-500 font-mono bg-slate-50 p-2 rounded">
            {importMode === 'matches' 
                ? 'Format: DD.MM.ÅÅÅÅ,HH:MM,Lag,Antall,Liga' 
                : 'Format: Navn,Brukernavn,Passord (komma-separert)'}
        </p>
        <textarea className="w-full h-40 border border-slate-300 p-3 rounded font-mono text-sm" placeholder="Lim inn data her..." value={importText} onChange={(e) => setImportText(e.target.value)} />
        <button onClick={handleImport} disabled={loading || !importText} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 font-medium">{loading ? 'Importerer...' : 'Kjør import'}</button>
        {msg && <p className="text-sm font-semibold text-slate-700 mt-2">{msg}</p>}
      </div>

      <hr className="border-slate-100" />
      
      {/* Liste over kamper med redigering */}
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Aktive kamper ({matches.length})</h3>
        <div className="space-y-2">
          {matches.map(m => (
            editingId === m.id ? (
              <EditMatchRow key={m.id} match={m} onSave={handleUpdateMatch} onCancel={() => setEditingId(null)} />
            ) : (
              <div key={m.id} className="flex justify-between items-center bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <div className="font-bold text-slate-800">{formatDateDisplay(m.date)} <span className="font-normal text-slate-500">kl {m.time}</span></div>
                  <div className="text-sm text-slate-600">{m.opponent} <span className="text-xs text-slate-400">({m.league})</span></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(m.id)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="Rediger">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeleteMatch(m)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Slett">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          ))}
          {matches.length === 0 && <p className="text-sm text-slate-400 italic">Ingen kamper lastet inn ennå.</p>}
        </div>
      </div>
    </div>
  );
};

export default App;