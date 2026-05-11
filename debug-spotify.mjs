async function debugSpotify() {
  console.log('Starting debug test for tracks...');
  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: '0cbd75c17961401cb0c6bc21d0ea3ffd',
        client_secret: 'f22c5c7fa16949b4b22cf7baa348cea6'
      })
    });
    const tokenData = await tokenRes.json();
    
    // Test Single Track
    const trackRes = await fetch('https://api.spotify.com/v1/tracks/11dFghVXANMlKmJXsNCbNl', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token }
    });
    console.log('Track Response:', trackRes.status);
    const data = await trackRes.json();
    console.log('Track Data Error?:', data.error);
    console.log('Track Name:', data.name);
  } catch (err) {
    console.error(err);
  }
}
debugSpotify();
