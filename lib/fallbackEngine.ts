export async function fetchLastFmTags(artist: string, track: string): Promise<string[]> {
  try {
    const res = await fetch(
      `http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${process.env.LASTFM_API_KEY}&artist=${encodeURIComponent(
        artist
      )}&track=${encodeURIComponent(track)}&format=json`
    );
    const data = await res.json();
    if (data.track && data.track.toptags && data.track.toptags.tag) {
      return data.track.toptags.tag.map((t: { name: string }) => t.name);
    }
  } catch (error) {
    console.error('Last.fm fallback error:', error);
  }
  return [];
}

export async function generateAiFallbackFeatures(trackName: string, artist: string) {
  // LLM Fallback function stub to estimate energy, valence, and tempo
  // Since we don't use a real LLM here, we use a deterministic heuristic based on the name length
  const seed = trackName.length + artist.length;
  
  return {
    energy: (seed % 10) / 10 + 0.1, // 0.1 to 1.0
    valence: ((seed * 3) % 10) / 10 + 0.1, 
    tempo: 80 + ((seed * 5) % 60), // 80 to 140
  };
}
