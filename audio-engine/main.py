from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import librosa
import os
import tempfile
import subprocess
import numpy as np
import json
import sys
import warnings
import time
from datetime import datetime

# Kütüphanelerin gereksiz kırmızı uyarı mesajlarını sonsuza dek susturuyoruz!
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔥 YENİ: Terminal loglarına otomatik SAAT:DAKİKA:SANİYE ekleyen özel yazdırıcı
def tprint(message: str):
    now = datetime.now().strftime("%H:%M:%S")
    print(f"[{now}] {message}")

def fetch_audio_info(query: str, platform: str, timeout_sec: int):
    search_query = f"{platform}:{query}"
    if platform == "ytsearch3":
        search_query += " official audio"

    cmd = [
        sys.executable, "-m", "yt_dlp",
        search_query,
        "--dump-json",          
        "--no-playlist",
        "--quiet",
        "--extractor-args", "youtube:player_client=android"
    ]
    
    try:
        result = subprocess.run(
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.DEVNULL, 
            timeout=timeout_sec, 
            text=True, 
            encoding='utf-8'
        )
        entries = []
        if result.returncode == 0 and result.stdout:
            for line in result.stdout.strip().split('\n'):
                if line.strip():
                    try:
                        entries.append(json.loads(line))
                    except:
                        pass
        return entries
    except subprocess.TimeoutExpired:
        tprint(f"🛑 [MOTOR KESİLDİ] {platform.upper()} {timeout_sec} saniyede takılı kaldı.")
        return []
    except Exception as e:
        tprint(f"⚠️ [MOTOR HATASI] {platform.upper()} çöktü: {e}")
        return []

def process_entries(entries, song_name, platform_name, target_duration_sec):
    for index, entry in enumerate(entries):
        stream_url = entry.get('url')
        if not stream_url:
            continue

        video_duration = entry.get('duration') or 0

        # ±10 Saniye Kusursuz Doğrulama Testi
        if target_duration_sec > 0 and video_duration > 0:
            time_diff = abs(video_duration - target_duration_sec)
            if time_diff > 10:
                tprint(f"⚠️ [{platform_name}] {index+1}. Kayıt Reddedildi: Süre Uyumsuz! (Spotify: {int(target_duration_sec)}s | Bulunan: {int(video_duration)}s)")
                continue 

        start_time = '00:00:30' if video_duration > 40 else '00:00:00'

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            temp_file_path = tmp.name

        try:
            user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            if 'http_headers' in entry and 'User-Agent' in entry['http_headers']:
                user_agent = entry['http_headers']['User-Agent']

            command = [
                'ffmpeg', '-y', 
                '-user_agent', user_agent,
                '-ss', start_time,  
                '-i', stream_url,
                '-t', '45', 
                '-c:a', 'pcm_s16le', 
                '-ar', '22050', 
                temp_file_path
            ]
            subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            if not os.path.exists(temp_file_path) or os.path.getsize(temp_file_path) < 1024:
                tprint(f"⚠️ [{platform_name}] {index+1}. Kayıt Boş İndi. Sıradakine geçiliyor...")
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                continue

            y, sr = librosa.load(temp_file_path, sr=22050)
            
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

            if len(y) == 0 or np.max(np.abs(y)) == 0.0:
                tprint(f"⚠️ [{platform_name}] {index+1}. Kayıt Tamamen Sessiz Çıktı. Sıradakine geçiliyor...")
                continue 

            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            tempo_array, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
            bpm = float(tempo_array[0]) if isinstance(tempo_array, np.ndarray) else float(tempo_array)
            
            if 0 < bpm < 90.0:
                bpm *= 2.0

            rms = librosa.feature.rms(y=y)
            raw_energy = float(rms.mean())
            energy_score = min(raw_energy * 2.5, 1.0) 

            spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
            centroid_mean = np.mean(spectral_centroid)
            brightness = min(1.0, centroid_mean / 3000.0)

            valence_raw = (energy_score * 0.4) + (brightness * 0.6)
            valence = max(0.0, min(1.0, valence_raw))

            if bpm > 0 and energy_score > 0.01:
                tprint(f"✅ [{platform_name}] Analiz Başarılı! (Şarkı Süresi: {int(video_duration)}s)")
                return {
                    "success": True,
                    "song": song_name,
                    "source": platform_name,
                    "tempo": round(bpm, 1),
                    "energy": round(energy_score, 3),
                    "valence": round(valence, 3)
                }
            else:
                tprint(f"⚠️ [{platform_name}] {index+1}. Kayıt okundu ama BPM ölçülemedi. Sıradakine geçiliyor...")
                continue
                
        except Exception as e:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            continue 
    
    return None

@app.get("/analyze")
async def analyze_song(song: str, duration_ms: int = 0):
    # 🔥 YENİ: Kronometre başlıyor!
    start_time = time.time()
    
    try:
        target_duration_sec = duration_ms / 1000.0

        print("") # Boşluk bırakıp yeni şarkıya temiz geçiş
        tprint(f"🎵 YouTube Motoru Başlatıldı: {song}")
        yt_entries = fetch_audio_info(song, "ytsearch3", 15)
        
        if yt_entries:
            result = process_entries(yt_entries, song, "YouTube", target_duration_sec)
            if result:
                elapsed = round(time.time() - start_time, 2)
                tprint(f"⏱️ İşlem {elapsed} saniyede tamamlandı.")
                return result  
        
        tprint(f"☁️ YouTube başarısız oldu. SoundCloud Motoru Ateşleniyor: {song}")
        sc_entries = fetch_audio_info(song, "scsearch3", 15)
        
        if sc_entries:
            result = process_entries(sc_entries, song, "SoundCloud", target_duration_sec)
            if result:
                elapsed = round(time.time() - start_time, 2)
                tprint(f"⏱️ İşlem {elapsed} saniyede tamamlandı.")
                return result

        elapsed = round(time.time() - start_time, 2)
        tprint(f"❌ İşlem başarısız ({elapsed} saniye sürdü). İki platformda da bulunamadı.")
        return {"success": False, "error": "Geçerli ses verisi çıkarılamadı (İki platformda da bulunamadı)"}

    except Exception as e:
        elapsed = round(time.time() - start_time, 2)
        tprint(f"❌ Kritik Hata ({elapsed} saniye sürdü): {str(e)}")
        return {"success": False, "error": str(e)}