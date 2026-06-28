import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MdArrowBack, MdPlayArrow, MdPlaylistAdd, MdPeople } from 'react-icons/md';
import { getArtistProfile, getArtistTopTracks } from '../utils/youtubeApi';
import usePlayerStore from '../store/usePlayerStore';

const formatSubs = (num) => {
  if (!num) return "";
  const n = parseInt(num);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + ' Mn';
  if (n >= 1000) return (n / 1000).toFixed(0) + ' B';
  return n.toString();
};

const ArtistDetail = () => {
  const { name } = useParams();
  const navigate = useNavigate();
  
  const playSong = usePlayerStore(s => s.playSong);
  const currentSong = usePlayerStore(s => s.currentSong);
  const openAddModal = usePlayerStore(s => s.openAddModal);

  const [artist, setArtist] = useState(null);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArtistData = async () => {
      setLoading(true);
      try {
        const profile = await getArtistProfile(name);
        setArtist(profile);
        
        // DÜZELTME: Eğer varsa albümlerin durduğu songsChannelId'yi kullan, yoksa şahsi ID'yi kullan
        const targetChannelId = profile.songsChannelId || profile.id;
        const tracks = await getArtistTopTracks(targetChannelId);
        setSongs(tracks);
      } catch (err) {
        console.error("Sanatçı yüklenemedi", err);
      } finally {
        setLoading(false);
      }
    };
    fetchArtistData();
  }, [name]);

  if (loading) return <div className="loading-container"><div className="loading-spinner">sync</div><p>Sanatçı Aranıyor...</p></div>;
  if (!artist) return <div style={{ padding: '20px', color: 'gray', textAlign: 'center', marginTop: '50px' }}>Böyle bir sanatçı bulunamadı. Lütfen kelimeleri doğru yazdığınıza emin olun.</div>;

  const playAll = () => {
    if(songs.length > 0) playSong(songs[0], songs, 0);
  };

  const cleanArtistName = artist.name
    .replace(/\s*-\s*Topic/i, '')
    .replace(/VEVO/i, '')
    .trim();

  return (
    <div className="artist-detail-page">
      <div className="back-btn-container" onClick={() => navigate(-1)}><MdArrowBack size={28} /></div>

      {/* Hero Banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '30px', marginBottom: '40px', marginTop: '20px', flexWrap: 'wrap' }}>
        <img 
          src={artist.thumbnail} 
          alt={artist.name} 
          referrerPolicy="no-referrer"
          style={{ width: '180px', height: '180px', borderRadius: '50%', objectFit: 'cover', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.1)' }} 
        />
        <div>
          <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px' }}>Doğrulanmış Sanatçı</span>
          <h1 style={{ fontSize: '48px', fontWeight: '900', lineHeight: '1.1', color: 'white', margin: '5px 0' }}>{cleanArtistName}</h1>
          {artist.subscriberCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px' }}>
              <MdPeople size={18} />
              <span>{formatSubs(artist.subscriberCount)} Takipçi</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '30px' }}>
        <button className="play-pause-btn big-play" onClick={playAll} style={{ width: '64px', height: '64px' }}><MdPlayArrow size={36} color="white" /></button>
        <span style={{ fontWeight: 'bold', fontSize: '16px' }}>Popüler Şarkılar</span>
      </div>

      <div className="song-list">
        {songs.map((song, index) => (
          <div key={song.id} className={`song-row ${currentSong?.id === song.id ? 'active' : ''}`} onClick={() => playSong(song, songs, index)}>
            <div style={{ width: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', fontWeight: 'bold' }}>{index + 1}</div>
            <div className="song-thumb-container">
              <img src={song.thumbnail} alt={song.title} className="song-thumb" />
              <div className="play-overlay"><MdPlayArrow size={24} color="white" /></div>
            </div>
            <div className="song-info">
              <div className="song-title">{song.title}</div>
            </div>
            <button className="icon-btn" style={{ marginLeft: 'auto', padding: '10px' }} onClick={(e) => { e.stopPropagation(); openAddModal(song); }}><MdPlaylistAdd size={24} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};
export default ArtistDetail;