const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const CACHE_TIME = 12 * 60 * 60 * 1000; // 12 Saat önbellek süresi

const parseISO8601Duration = (durationString) => {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = durationString.match(regex);
    if (!matches) return 0;
    const hours = parseInt(matches[1] || 0, 10);
    const minutes = parseInt(matches[2] || 0, 10);
    const seconds = parseInt(matches[3] || 0, 10);
    return hours * 3600 + minutes * 60 + seconds;
};

// 1. Trend Listelerini Çekme
export const getTrendings = async (regionCode = 'TR') => {
    const cacheKey = `yt_trend_${regionCode}`;
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    
    if (cached && Date.now() - cached.timestamp < CACHE_TIME) {
        return cached.data;
    }
    
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&videoCategoryId=10&regionCode=${regionCode}&maxResults=50&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    
    const songs = data.items.map((item, idx) => ({
        id: item.id,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
        uniqueId: `trend-${regionCode}-${item.id}-${idx}`
    }));
    
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: songs }));
    return songs;
};

// 2. Sanatçı Profilini Bulma (TOPIC & VEVO BULUCU YENİ SİSTEM)
export const getArtistProfile = async (query) => {
    const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=5&key=${API_KEY}`);
    const searchData = await searchRes.json();
    
    if (!searchData.items || searchData.items.length === 0) throw new Error("Sanatçı bulunamadı");
    
    const channelIds = searchData.items.map(item => item.id?.channelId).filter(Boolean).join(',');
    
    if (!channelIds) {
        const first = searchData.items[0];
        return {
            id: first.id?.channelId || '',
            songsChannelId: first.id?.channelId || '',
            name: first.snippet.title,
            thumbnail: first.snippet.thumbnails.high?.url || first.snippet.thumbnails.default?.url,
            subscriberCount: 0
        };
    }

    try {
        const chanRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds}&key=${API_KEY}`);
        const chanData = await chanRes.json();
        
        if (chanData.items && chanData.items.length > 0) {
            // Aboneye göre sırala (Resmi şahsi kanalı bulmak için)
            const sortedChannels = [...chanData.items].sort((a, b) => {
                const subA = parseInt(a.statistics?.subscriberCount || 0, 10);
                const subB = parseInt(b.statistics?.subscriberCount || 0, 10);
                return subB - subA;
            });
            
            const officialChannel = sortedChannels[0];

            // AKILLI EŞLEME: 5 kanal içinde "- Topic" veya "VEVO" olan albüm kanalını ara
            const topicChannel = chanData.items.find(c => 
                c.snippet.title.toLowerCase().endsWith('- topic') || 
                c.snippet.title.toLowerCase().includes('vevo')
            );

            // Albüm kanalı varsa şarkıları oradan çek, yoksa şahsi resmi kanaldan çek
            const songsChannelId = topicChannel ? topicChannel.id : officialChannel.id;

            return {
                id: officialChannel.id,
                songsChannelId: songsChannelId, // Şarkıların çekileceği asıl kanal ID'si
                name: officialChannel.snippet.title,
                thumbnail: officialChannel.snippet.thumbnails.high?.url || officialChannel.snippet.thumbnails.medium?.url || officialChannel.snippet.thumbnails.default?.url,
                subscriberCount: officialChannel.statistics?.subscriberCount || 0
            };
        }
    } catch (e) {
        console.warn("Resmi kanallar toplu listelenemedi.", e);
    }
    
    const firstChannel = searchData.items[0];
    return {
        id: firstChannel.id.channelId,
        songsChannelId: firstChannel.id.channelId,
        name: firstChannel.snippet.title,
        thumbnail: firstChannel.snippet.thumbnails.high?.url || firstChannel.snippet.thumbnails.default?.url,
        subscriberCount: 0
    };
};

// 3. Sanatçının Popüler Şarkılarını Bulma (HİBRİT RE-ESNEK FİLTRE)
export const getArtistTopTracks = async (channelId) => {
    const uploadPlaylistId = channelId.replace(/^UC/, 'UU');
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadPlaylistId}&maxResults=50&key=${API_KEY}`);
    const data = await res.json();
    
    if (!data.items || data.items.length === 0) return [];

    const videoIds = data.items.map(item => item.snippet.resourceId.videoId).join(',');
    const videoRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${API_KEY}`);
    const videoData = await videoRes.json();
    
    const videoMetaMap = {};
    if (videoData.items) {
        videoData.items.forEach(item => {
            videoMetaMap[item.id] = {
                duration: parseISO8601Duration(item.contentDetails.duration),
                categoryId: item.snippet.categoryId
            };
        });
    }

    return data.items
        .map((item, idx) => {
            const videoId = item.snippet.resourceId.videoId;
            const meta = videoMetaMap[videoId] || { duration: 0, categoryId: "" };
            return {
                id: videoId,
                title: item.snippet.title,
                channel: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
                thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
                uniqueId: `artist-${videoId}-${idx}`,
                duration: meta.duration,
                categoryId: meta.categoryId
            };
        })
        .filter(song => 
            song.title !== 'Private video' && 
            song.title !== 'Deleted video' &&
            !song.title.toLowerCase().includes('#shorts') &&
            !song.title.toLowerCase().includes('teaser') &&
            !song.title.toLowerCase().includes('fragman') &&
            !song.title.toLowerCase().includes('behind the scenes') &&
            !song.title.toLowerCase().includes('interview') &&
            !song.title.toLowerCase().includes('vlog') &&
            // AKILLI ESNEK FİLTRE: 
            // Resmi Müzik kategorisindeyse 1 dakikadan uzun olması (Shorts engeli) yeterlidir.
            // Eğer müzik dışı kategorideyse en az 2 dakika (120sn) olmalıdır (Tanıtımları eler, bağımsız klipleri korur).
            (song.categoryId === "10" ? song.duration >= 60 : song.duration >= 120)
        );
};const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const CACHE_TIME = 12 * 60 * 60 * 1000; // 12 Saat önbellek süresi

const parseISO8601Duration = (durationString) => {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = durationString.match(regex);
    if (!matches) return 0;
    const hours = parseInt(matches[1] || 0, 10);
    const minutes = parseInt(matches[2] || 0, 10);
    const seconds = parseInt(matches[3] || 0, 10);
    return hours * 3600 + minutes * 60 + seconds;
};

// 1. Trend Listelerini Çekme (12 Saat Önbellekli)
export const getTrendings = async (regionCode = 'TR') => {
    const cacheKey = `yt_trend_${regionCode}`;
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    
    if (cached && Date.now() - cached.timestamp < CACHE_TIME) {
        return cached.data;
    }
    
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&videoCategoryId=10&regionCode=${regionCode}&maxResults=50&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    
    const songs = data.items.map((item, idx) => ({
        id: item.id,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
        uniqueId: `trend-${regionCode}-${item.id}-${idx}`
    }));
    
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: songs }));
    return songs;
};

// 2. Sanatçı Profilini Bulma (YENİ: 12 Saat Önbellekli!)
export const getArtistProfile = async (query) => {
    const queryClean = query.toLowerCase().trim();
    const cacheKey = `artist_prof_${queryClean}`;
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    
    // Eğer 12 saat içinde bu sanatçı aranmışsa doğrudan hafızadan çek (0 Kota!)
    if (cached && Date.now() - cached.timestamp < CACHE_TIME) {
        return cached.data;
    }

    const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=5&key=${API_KEY}`);
    const searchData = await searchRes.json();
    
    if (!searchData.items || searchData.items.length === 0) throw new Error("Sanatçı bulunamadı");
    
    const channelIds = searchData.items.map(item => item.id?.channelId).filter(Boolean).join(',');
    
    if (!channelIds) {
        const first = searchData.items[0];
        const backupResult = {
            id: first.id?.channelId || '',
            songsChannelId: first.id?.channelId || '',
            name: first.snippet.title,
            thumbnail: first.snippet.thumbnails.high?.url || first.snippet.thumbnails.default?.url,
            subscriberCount: 0
        };
        return backupResult;
    }

    try {
        const chanRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds}&key=${API_KEY}`);
        const chanData = await chanRes.json();
        
        if (chanData.items && chanData.items.length > 0) {
            const sortedChannels = chanData.items.sort((a, b) => {
                const subA = parseInt(a.statistics?.subscriberCount || 0, 10);
                const subB = parseInt(b.statistics?.subscriberCount || 0, 10);
                return subB - subA;
            });
            
            const officialChannel = sortedChannels[0];
            const topicChannel = chanData.items.find(c => 
                c.snippet.title.toLowerCase().endsWith('- topic') || 
                c.snippet.title.toLowerCase().includes('vevo')
            );

            const songsChannelId = topicChannel ? topicChannel.id : officialChannel.id;

            const finalResult = {
                id: officialChannel.id,
                songsChannelId: songsChannelId,
                name: officialChannel.snippet.title,
                thumbnail: officialChannel.snippet.thumbnails.high?.url || officialChannel.snippet.thumbnails.medium?.url || officialChannel.snippet.thumbnails.default?.url,
                subscriberCount: officialChannel.statistics?.subscriberCount || 0
            };

            // Sonucu önbelleğe kaydet
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: finalResult }));
            return finalResult;
        }
    } catch (e) {
        console.warn("Resmi kanallar toplu listelenemedi.", e);
    }
    
    const firstChannel = searchData.items[0];
    const failResult = {
        id: firstChannel.id.channelId,
        songsChannelId: firstChannel.id.channelId,
        name: firstChannel.snippet.title,
        thumbnail: firstChannel.snippet.thumbnails.high?.url || firstChannel.snippet.thumbnails.default?.url,
        subscriberCount: 0
    };
    return failResult;
};

// 3. Sanatçının Popüler Şarkılarını Bulma (YENİ: 12 Saat Önbellekli!)
export const getArtistTopTracks = async (channelId) => {
    const cacheKey = `artist_tracks_${channelId}`;
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    
    // Eğer şarkılar hafızada varsa doğrudan oradan oku (0 Kota!)
    if (cached && Date.now() - cached.timestamp < CACHE_TIME) {
        return cached.data;
    }

    const uploadPlaylistId = channelId.replace(/^UC/, 'UU');
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadPlaylistId}&maxResults=50&key=${API_KEY}`);
    const data = await res.json();
    
    if (!data.items || data.items.length === 0) return [];

    const videoIds = data.items.map(item => item.snippet.resourceId.videoId).join(',');
    const videoRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${API_KEY}`);
    const videoData = await videoRes.json();
    
    const videoMetaMap = {};
    if (videoData.items) {
        videoData.items.forEach(item => {
            videoMetaMap[item.id] = {
                duration: parseISO8601Duration(item.contentDetails.duration),
                categoryId: item.snippet.categoryId
            };
        });
    }

    const tracks = data.items
        .map((item, idx) => {
            const videoId = item.snippet.resourceId.videoId;
            const meta = videoMetaMap[videoId] || { duration: 0, categoryId: "" };
            return {
                id: videoId,
                title: item.snippet.title,
                channel: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
                thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
                uniqueId: `artist-${videoId}-${idx}`,
                duration: meta.duration,
                categoryId: meta.categoryId
            };
        })
        .filter(song => 
            song.title !== 'Private video' && 
            song.title !== 'Deleted video' &&
            !song.title.toLowerCase().includes('#shorts') &&
            !song.title.toLowerCase().includes('teaser') &&
            !song.title.toLowerCase().includes('fragman') &&
            !song.title.toLowerCase().includes('behind the scenes') &&
            !song.title.toLowerCase().includes('interview') &&
            !song.title.toLowerCase().includes('vlog') &&
            (song.categoryId === "10" ? song.duration >= 60 : song.duration >= 120)
        );

    // Şarkıları önbelleğe kaydet
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: tracks }));
    return tracks;
};