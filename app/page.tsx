"use client";

import { useState, useRef } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type Song = {
  id: string;
  name: string;
  artist: string;
  imageUrl: string;
  energy: number;
  valence: number;
  tempo: number;
  tags: string[];
};

export default function Home() {
  const { data: session, status } = useSession();
  const [url, setUrl] = useState("");
  const [tracks, setTracks] = useState<Song[]>([]);
  const [playlistMeta, setPlaylistMeta] = useState<{name: string, imageUrl: string | null, owner: string} | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, song: "" });
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");

  const abortControllerRef = useRef<AbortController | null>(null);

  const analyzePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    setLoading(true);
    setError(null);
    setTracks([]);
    setPlaylistMeta(null);
    setProgress({ current: 0, total: 0, song: "Bağlantı kuruluyor..." });
    
    abortControllerRef.current = new AbortController();
    
    let currentOffset = 0;
    let totalTracksInPlaylist = 1; 
    let accumulatedTracks: Song[] = [];

    try {
      while (currentOffset < totalTracksInPlaylist) {
        setProgress((p) => ({ ...p, song: "Paket çekiliyor..." }));

        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, offset: currentOffset }),
          signal: abortControllerRef.current.signal 
        });
        
        if (!res.ok) {
           const errText = await res.text();
           try {
               const errJson = JSON.parse(errText);
               throw new Error(errJson.error || "Bir hata oluştu.");
           } catch {
               throw new Error("Sunucu ile bağlantı kurulamadı.");
           }
        }

        if (!res.body) throw new Error("Akış (Stream) desteklenmiyor.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = ""; 

        while (true) {
          const { value, done: readerDone } = await reader.read();
          
          if (value) {
            buffer += decoder.decode(value, { stream: true });
          }

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              
              if (data.status === "start") {
                totalTracksInPlaylist = data.totalTracksInPlaylist;
                setProgress((p) => ({ ...p, total: totalTracksInPlaylist, song: "Şarkılar çözümleniyor..." }));
                if (currentOffset === 0 && data.playlist) {
                  setPlaylistMeta(data.playlist);
                }
              } 
              else if (data.status === "processing") {
                setProgress((p) => ({ ...p, current: data.current, song: data.trackName }));
              } 
              else if (data.status === "single_track_done") {
                accumulatedTracks = [...accumulatedTracks, data.track];
                setTracks(accumulatedTracks); 
              } 
              else if (data.status === "done") {
                // Done block is empty
              } 
              else if (data.error) {
                throw new Error(data.error);
              }
            } catch (e) {}
          }

          if (readerDone) {
            break; 
          }
        }

        currentOffset += 100; 

        if (currentOffset < totalTracksInPlaylist) {
          setProgress((p) => ({ ...p, song: "Aşırı yüklenmeyi önlemek için dinleniliyor (2sn)..." }));
          
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 2000);
            if (abortControllerRef.current?.signal.aborted) {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            }
            abortControllerRef.current?.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            });
          });
        }
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
         console.log("Analiz kullanıcı tarafından durduruldu.");
      } else {
         setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStopAndShow = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort(); 
    }
    setLoading(false); 
  };

  const handleFullCancel = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    setLoading(false);
    setTracks([]); 
    setPlaylistMeta(null);
    setProgress({ current: 0, total: 0, song: "" });
  };

  const filteredTracks = tracks.filter((t) => {
    if (filter === "Sleep") return t.energy < 0.4;
    if (filter === "Workout") return t.energy > 0.6;
    if (filter === "Happy") return t.valence > 0.5;
    if (filter === "Sad") return t.valence <= 0.5;
    return true; 
  });

  const getMoodColor = (track: Song) => {
    // 🔥 YENİ: Bulunamayan şarkılar için gri, soluk ve terkedilmiş bir tema
    if (track.tags.includes('şarkı-bulunamadı')) return "from-zinc-900/50 to-neutral-900/80 border-zinc-700/30 grayscale opacity-50";
    if (track.tags.includes('analiz-edilemedi')) return "from-red-900/20 to-neutral-900/40 border-red-900/30 grayscale opacity-80";
    if (track.energy > 0.6 && track.valence > 0.5) return "from-orange-500/20 to-red-500/10 border-orange-500/30";
    if (track.valence <= 0.5 && track.energy < 0.5) return "from-blue-500/20 to-indigo-500/10 border-blue-500/30";
    if (track.energy > 0.6) return "from-green-500/20 to-emerald-500/10 border-green-500/30";
    return "from-purple-500/20 to-pink-500/10 border-purple-500/30";
  };

  return (
    <main className="min-h-screen p-8 md:p-16 flex flex-col items-center max-w-7xl mx-auto relative">
      
      {/* HEADER / NAVIGATION */}
      <div className="w-full flex justify-end mb-8 relative z-20">
        {status === "loading" ? (
          <div className="h-10 w-24 bg-white/5 animate-pulse rounded-full"></div>
        ) : session ? (
          <div className="flex items-center gap-4 bg-white/5 border border-white/10 px-4 py-2 rounded-full">
            {session?.user?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt={session.user.name || "User"} className="w-8 h-8 rounded-full" />
            )}
            <span className="text-sm font-medium text-neutral-300 hidden sm:block">{session?.user?.name}</span>
            <button onClick={() => signOut()} className="text-xs text-neutral-400 hover:text-white transition-colors ml-2 border-l border-white/10 pl-4 py-1">
              Sign out
            </button>
          </div>
        ) : (
          <button onClick={() => signIn("spotify")} className="flex items-center gap-2 bg-[#1DB954]/20 hover:bg-[#1DB954]/40 border border-[#1DB954]/50 text-[#1DB954] hover:text-white px-4 py-2 rounded-full transition-all text-sm font-bold">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15.001 10.62 18.72 12.9c.42.18.6.78.24 1.14zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
            Spotify Login
          </button>
        )}
      </div>

      <div className="text-center mb-12 animate-fade-in relative z-10">
        <h1 className="text-5xl md:text-7xl font-aquire tracking-widest mb-4 text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-600 drop-shadow-sm">
          Music Analyzer
        </h1>
        <p className="text-neutral-400 text-lg md:text-xl max-w-2xl mx-auto mb-4">
          Analyze any public Spotify playlist securely. Discover its mood and energy mathematically powered by our custom DSP Engine.
        </p>
      </div>

      <form onSubmit={analyzePlaylist} className="w-full max-w-3xl mb-12 relative group animate-fade-in-up">
        <div className="absolute -inset-1 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-500"></div>
        <div className="relative flex flex-col sm:flex-row gap-4 bg-neutral-900 border border-neutral-800 p-2 rounded-2xl shadow-2xl">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste Spotify Playlist URL..."
            className="flex-1 bg-transparent px-6 py-4 outline-none text-white placeholder-neutral-500 text-lg rounded-xl transition-all focus:bg-white/5"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold px-8 py-4 rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-6 py-4 rounded-xl mb-8 flex items-center gap-3">
          <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          {error}
        </div>
      )}

      {tracks.length > 0 && !loading && (
        <div className="w-full flex-1 flex flex-col animate-fade-in-up">
          {playlistMeta && (
            <div className="w-full mb-12 flex flex-col md:flex-row items-center md:items-end gap-6 bg-neutral-900/40 p-6 md:p-8 rounded-3xl border border-white/5 backdrop-blur-sm">
              {playlistMeta.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={playlistMeta.imageUrl} 
                  alt={playlistMeta.name} 
                  className="w-40 h-40 md:w-56 md:h-56 shadow-2xl rounded-2xl object-cover ring-1 ring-white/10"
                />
              ) : (
                <div className="w-40 h-40 md:w-56 md:h-56 bg-neutral-800 rounded-2xl flex items-center justify-center shadow-xl ring-1 ring-white/10">
                  <span className="text-neutral-500">No Cover</span>
                </div>
              )}
              <div className="text-center md:text-left flex-1">
                <span className="text-xs font-bold tracking-widest uppercase text-emerald-500 mb-2 block">Playlist Analysis</span>
                <h2 className="text-3xl md:text-5xl font-black text-white mb-2 leading-tight drop-shadow-md">{playlistMeta.name}</h2>
                <div className="flex items-center justify-center md:justify-start gap-2 text-neutral-400 font-medium">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="https://i.scdn.co/image/ab67757000003b8255c25988a6d41c1e27392a83" alt="User" className="w-5 h-5 rounded-full grayscale opacity-70" />
                  <span>{playlistMeta.owner}</span>
                  <span className="text-neutral-600 px-1">•</span>
                  <span className="text-emerald-400">{tracks.length} Tracks Scanned</span>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {["All", "Sleep", "Workout", "Happy", "Sad"].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-6 py-2 rounded-full font-medium transition-all duration-300 ${
                  filter === cat
                    ? "bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.4)] transform scale-105"
                    : "bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full">
            {filteredTracks.map((track) => (
              <div
                key={track.id}
                className={`relative overflow-hidden group rounded-2xl bg-gradient-to-br bg-neutral-900 border transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-emerald-500/10 ${getMoodColor(track)}`}
              >
                <div className="aspect-square w-full overflow-hidden relative">
                  {track.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={track.imageUrl}
                      alt={track.name}
                      className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                      <span className="text-neutral-600">No Image</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-80 group-hover:opacity-60 transition-opacity"></div>
                  
                  <div className="absolute bottom-0 left-0 p-5 w-full">
                    <h3 className="text-xl font-bold text-white leading-tight truncate drop-shadow-md">
                      {track.name}
                    </h3>
                    <p className="text-neutral-300 text-sm truncate mt-1 drop-shadow">
                      {track.artist}
                    </p>
                  </div>
                </div>

                <div className="p-5 relative z-10 bg-black/40 backdrop-blur-sm border-t border-white/5">
                  <div className="flex justify-between items-center mb-4">
                    <div className="text-center flex-1">
                      <div className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-1">Energy</div>
                      <div className="font-mono text-emerald-400 font-bold">{(track.energy * 100).toFixed(0)}%</div>
                    </div>
                    <div className="w-px h-8 bg-white/10 mx-2"></div>
                    <div className="text-center flex-1">
                      <div className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-1">Valence</div>
                      <div className="font-mono text-pink-400 font-bold">{(track.valence * 100).toFixed(0)}%</div>
                    </div>
                    <div className="w-px h-8 bg-white/10 mx-2"></div>
                    <div className="text-center flex-1">
                      <div className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-1">Tempo</div>
                      <div className="font-mono text-amber-400 font-bold">{Math.round(track.tempo)}</div>
                    </div>
                  </div>
                  
                  {track.tags && track.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {/* 🔥 DEĞİŞİKLİK 1: t !== 'database' filtresini kaldırdık ve slice(0, 5) yaptık */}
                      {track.tags.slice(0, 5).filter(t => t !== 'fallback-data' && t !== 'python-analyzed').map((tag, idx) => {
                        
                        let tagColor = "bg-white/10 text-neutral-300 border-white/5";
                        let displayTag = tag.replace(/-/g, ' ').toUpperCase();

                        // Platformlara Göre Dinamik Siberpunk Renkler
                        if (tag === "YouTube") tagColor = "bg-red-500/20 text-red-400 border-red-500/30";
                        if (tag === "SoundCloud") tagColor = "bg-orange-500/20 text-orange-400 border-orange-500/30";
                        if (tag === "şarkı-bulunamadı") tagColor = "bg-zinc-800/60 text-zinc-300 border-zinc-600/50 line-through";
                        if (tag === "analiz-edilemedi") tagColor = "bg-red-900/40 text-red-300 border-red-900/50";
                        
                        // 🔥 DEĞİŞİKLİK 2: Veritabanı için Mavi/Cyan şık bir tasarım ve İkon
                        if (tag === "database") {
                           tagColor = "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
                           displayTag = "VERİTABANI";
                        }

                        return (
                          <span key={idx} className={`text-xs px-2.5 py-1 rounded-md border font-medium tracking-wide flex items-center gap-1 ${tagColor}`}>
                            {/* Veritabanı etiketi gelirse yanına minik bir disk/server ikonu koyuyoruz */}
                            {tag === "database" && (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                              </svg>
                            )}
                            {displayTag}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SİBERPUNK YÜKLEME EKRANI */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md transition-opacity duration-300">
          <div className="bg-neutral-900/80 p-8 rounded-2xl flex flex-col items-center max-w-md w-full border border-teal-500/30 shadow-[0_0_50px_rgba(20,184,166,0.15)] relative">
            <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
            
            <h2 className="font-aquire text-2xl tracking-widest text-teal-400 mb-2 animate-pulse">
              ANALYZING
            </h2>
            
            <p className="text-neutral-300 text-center mb-6 h-8 overflow-hidden text-ellipsis whitespace-nowrap w-full">
              {progress.song}
            </p>

            <div className="w-full bg-neutral-800 rounded-full h-2 mb-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-teal-400 to-emerald-500 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between w-full text-xs text-neutral-500 font-mono mb-8">
              <span>{progress.current} / {progress.total || "?"} TRACKS</span>
              <span>{Math.round(progress.total > 0 ? (progress.current / progress.total) * 100 : 0)}%</span>
            </div>

            {/* 🔥 YENİ: İPTAL VE DURDURMA BUTONLARI */}
            <div className="flex w-full gap-3">
               <button 
                 onClick={handleFullCancel}
                 className="flex-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 py-2.5 rounded-xl transition-all text-sm font-bold flex items-center justify-center gap-2"
               >
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                 İptal Et
               </button>
               
               <button 
                 onClick={handleStopAndShow}
                 className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 py-2.5 rounded-xl transition-all text-sm font-bold flex items-center justify-center gap-2"
                 title="O ana kadar analiz edilen şarkıları gösterir"
               >
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v10M16 7v10" /></svg>
                 Durdur & Göster
               </button>
            </div>

          </div>
        </div>
      )}
    </main>
  );
}