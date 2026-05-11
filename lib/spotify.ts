import SpotifyWebApi from 'spotify-web-api-node';

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

export const getSpotifyToken = async () => {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
    return spotifyApi;
  } catch (error) {
    console.error('Error retrieving Spotify token', error);
    throw error;
  }
};

export default spotifyApi;
