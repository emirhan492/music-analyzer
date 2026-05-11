import { prisma } from '@/lib/prisma';
import SpotifyWebApi from 'spotify-web-api-node';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

export const dynamic = 'force-dynamic';

const getTimeStr = () => new Date().toLocaleTimeString('tr-TR', { hour12: false });

async function getFeaturesFromPythonEngine(artistName: string, trackName: string, durationMs: number) {
  const query = encodeURIComponent(`${artistName} ${trackName}`);
  try {
    const response = await fetch(`http://127.0.0.1:8000/analyze?song=${query}&duration_ms=${durationMs}`, {
      signal: AbortSignal.timeout(60000) 
    });
    
    if (!response.ok) return { success: false, error: 'HTTP Fetch Hatası' };
    const data = await response.json();
    return data;
  } catch (error: any) {
    return { success: false, error: 'Sistem Zaman Aşımı' };
  }
}

export async function POST(req: Request) {
  try {
    const { url, offset = 0 } = await req.json();
    
    if (!url) return new Response(JSON.stringify({ error: '[HATA 1] Playlist URL si eksik gönderildi.' }), { status: 400 });

    const playlistIdMatch = url.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!playlistIdMatch || !playlistIdMatch[1]) {
      return new Response(JSON.stringify({ error: `[HATA 2] Geçersiz Spotify Linki kopyaladınız.` }), { status: 400 });
    }
    const playlistId = playlistIdMatch[1];

    const session = await getServerSession(authOptions);
    const spotifyApi = new SpotifyWebApi({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (session && (session as any).accessToken) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spotifyApi.setAccessToken((session as any).accessToken);
      } else {
        const data = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(data.body['access_token']);
      }
    } catch (authError) {
      return new Response(JSON.stringify({ error: "[HATA 3] Spotify Yetkilendirme (Token) alınamadı." }), { status: 500 });
    }

    let playlistMeta = null;
    if (offset === 0) {
       try {
         const playlistData = await spotifyApi.getPlaylist(playlistId, { fields: 'name,images,owner' });
         playlistMeta = {
           name: playlistData.body.name || "Bilinmeyen Liste",
           imageUrl: playlistData.body.images?.[0]?.url || null,
           owner: playlistData.body.owner?.display_name || "Bilinmeyen",
         };
       } catch (e) {}
    }

    let tracksData;
    try {
       let token = spotifyApi.getAccessToken();
       
       let spotifyRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items?offset=${offset}&limit=100`, {
         headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
       });

       if (spotifyRes.status === 401) {
           console.log(`[${getTimeStr()}] ⚠️ [TOKEN SÜRESİ DOLDU] Kullanıcının kişisel jetonu yenileniyor...`);
           
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           const refreshToken = (session as any)?.refreshToken || (session as any)?.user?.refreshToken;

           if (refreshToken) {
               spotifyApi.setRefreshToken(refreshToken);
               const refreshData = await spotifyApi.refreshAccessToken();
               token = refreshData.body['access_token'];
               
               spotifyRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items?offset=${offset}&limit=100`, {
                 headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
               });
               console.log(`[${getTimeStr()}] ✅ [TOKEN YENİLENDİ] Kullanıcı kopmadan analize devam ediliyor!`);
           } else {
               console.log(`[${getTimeStr()}] ❌ [REFRESH TOKEN YOK] NextAuth'ta RefreshToken tanımlı değil.`);
               return new Response(JSON.stringify({ error: `[OTURUM DOLDU] 1 saatlik Spotify güvenlik sınırı. Lütfen sayfayı yenileyip baştan giriş yapın.` }), { status: 400 });
           }
       }

       if (!spotifyRes.ok) return new Response(JSON.stringify({ error: `[HATA 4] Şarkılar Spotify'dan çekilemedi.` }), { status: 400 });
       const responseJson = await spotifyRes.json();
       tracksData = { body: responseJson };

    } catch (e: any) {
       return new Response(JSON.stringify({ error: `[HATA 4] Sistemsel Fetch hatası.` }), { status: 400 });
    }

    const totalTracksInPlaylist = tracksData.body.total; 
    const rawItems = tracksData.body.items || [];
    const items = rawItems.filter((i: any) => i && (i.track || i.item) && !(i.track || i.item).is_local);

    if (items.length === 0 && offset === 0) {
      return new Response(JSON.stringify({ error: "[HATA 5] Bu listede çalınabilir bir şarkı bulunamadı." }), { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ 
              status: 'start', totalTracksInPlaylist: totalTracksInPlaylist, currentChunkSize: items.length, playlist: playlistMeta 
          }) + '\n'));
          
          const results = [];
          let current = 0;

          for (const item of items) {
            if (req.signal.aborted) break; 
            current++;
            const track = item.track || item.item;
            if (!track) continue;

            const trackId = track.id;
            const trackName = track.name;
            const primaryArtist = track.artists && track.artists.length > 0 ? track.artists[0].name : 'Unknown';
            const allArtists = track.artists.map((a: { name: string }) => a.name).join(', ');
            const imageUrl = track.album?.images?.[0]?.url || '';
            const durationMs = track.duration_ms || 0; 

            controller.enqueue(encoder.encode(JSON.stringify({ 
                status: 'processing', current: offset + current, trackName: `${trackName} - ${primaryArtist}` 
            }) + '\n'));

            // 🔥 DEĞİŞİKLİK 1: Veritabanı okuma hatalarını artık görüyoruz!
            let song = null;
            try { 
              song = await prisma.song.findUnique({ where: { id: trackId } }); 
            } catch (e: any) {
              console.log(`[${getTimeStr()}] 🔴 [DB OKUMA HATASI] ${trackName}:`, e.message || e);
            }

            // Eğer şarkı veritabanında varsa Python'u boşverip doğrudan DB'den çek
            if (song) {
              // Veritabanından gelen tag'ler dizi (array) değilse çökmeyi engelle
              const dbTags = Array.isArray(song.tags) ? song.tags : [];
              song.tags = ['database', ...dbTags];
              
              results.push(song);
              controller.enqueue(encoder.encode(JSON.stringify({ status: 'single_track_done', track: song }) + '\n'));
              console.log(`[${getTimeStr()}] 🟢 [VERİTABANI] Zaten analiz edilmiş, es geçildi: ${trackName}`);
              continue; 
            }

            console.log(`[${getTimeStr()}] 🟡 [PYTHON] Analiz Ediliyor: ${trackName} (${offset + current}/${totalTracksInPlaylist})`);
            
            let features = await getFeaturesFromPythonEngine(primaryArtist, trackName, durationMs);

            if (!features || !features.success || features.tempo === 0) {
               
               let errorTag = 'analiz-edilemedi';
               if (features?.error && (features.error.toLowerCase().includes('bulunamadı') || features.error.toLowerCase().includes('bulunamadi'))) {
                   errorTag = 'şarkı-bulunamadı';
               }

               const failedTrack = {
                 id: trackId, name: trackName, artist: allArtists, imageUrl,
                 energy: 0, valence: 0, tempo: 0, tags: [errorTag]
               };
               results.push(failedTrack);
               controller.enqueue(encoder.encode(JSON.stringify({ status: 'single_track_done', track: failedTrack }) + '\n'));
               
               const randomDelay = Math.floor(Math.random() * 3000) + 2000;
               await new Promise(resolve => setTimeout(resolve, randomDelay));
               continue; 
            }

            const appliedTags = ['python-analyzed'];
            if (features.source) {
                appliedTags.push(features.source);
            }

            const newSong = {
              id: trackId, name: trackName, artist: allArtists, imageUrl,
              energy: features.energy, valence: features.valence, tempo: features.tempo, tags: appliedTags,
            };

            // 🔥 DEĞİŞİKLİK 2: Veritabanı yazma hataları artık sessizce yutulmuyor!
            let finalTrack = newSong;
            try {
              finalTrack = await prisma.song.create({ data: newSong });
              results.push(finalTrack);
              console.log(`[${getTimeStr()}] 💾 [DB KAYDEDİLDİ] Yeni şarkı veritabanına işlendi: ${trackName}`);
            } catch (e: any) {
              console.log(`[${getTimeStr()}] 🔴 [DB YAZMA HATASI] ${trackName} kaydedilemedi:`, e.message || e);
              results.push(newSong); 
            }

            controller.enqueue(encoder.encode(JSON.stringify({ status: 'single_track_done', track: finalTrack }) + '\n'));

            const randomDelay = Math.floor(Math.random() * 3000) + 2000;
            await new Promise(resolve => setTimeout(resolve, randomDelay));
            
            if (current % 50 === 0) {
               console.log(`[${getTimeStr()}] ☕ [MOLA] ${current} şarkı işlendi. Sistem 15 saniye dinleniyor...`);
               await new Promise(resolve => setTimeout(resolve, 15000));
            }
          }

          controller.enqueue(encoder.encode(JSON.stringify({ status: 'done', playlist: playlistMeta, tracks: results }) + '\n'));
          controller.close();

        } catch (error) {
          controller.enqueue(encoder.encode(JSON.stringify({ error: "Analiz sırasında hata oluştu." }) + '\n'));
          controller.close();
        }
      }
    });

    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });

  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}