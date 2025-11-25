"use client";

import { useEffect, useState, useCallback } from 'react';
import { Search, Music, Plus, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

export default function GuestPage({ params }: { params: Promise<{ code: string }> }) {
    const [resolvedParams, setResolvedParams] = useState<{ code: string } | null>(null);
    const [roomInfo, setRoomInfo] = useState<any>(null);
    const [queue, setQueue] = useState<any[]>([]);
    const [guestId, setGuestId] = useState<string>(""); // <--- Estado para el ID

    // Estados de Búsqueda
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);

    // --- 0. GENERAR ID ÚNICO DEL INVITADO ---
    useEffect(() => {
        // Intentamos leer del localStorage
        let storedId = localStorage.getItem('party_guest_id');
        if (!storedId) {
            // Si no existe, creamos uno nuevo (usando random y fecha para ser único)
            storedId = 'guest_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
            localStorage.setItem('party_guest_id', storedId);
        }
        setGuestId(storedId);
    }, []);

    // --- 1. CARGAR SALA ---
    useEffect(() => { params.then(setResolvedParams); }, [params]);

    const fetchQueue = useCallback(async () => {
        if (!resolvedParams) return;
        try {
            const res = await fetch(`http://192.168.10.10:8000/queue/${resolvedParams.code}`);
            const data = await res.json();
            if (Array.isArray(data)) setQueue(data);
        } catch (e) { console.error(e); }
    }, [resolvedParams]);

    useEffect(() => {
        if (!resolvedParams) return;

        // Carga inicial...
        fetch(`http://192.168.10.10:8000/join/${resolvedParams.code}`).then(r => r.json()).then(setRoomInfo);
        fetchQueue();

        // CONEXIÓN WS
        const wsUrl = `ws://192.168.10.10:8000/ws/${resolvedParams.code}`;
        console.log("🔌 Invitado intentando conectar a:", wsUrl);

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => console.log("🟢 Invitado: ¡Socket Conectado!");
        ws.onerror = (e) => console.error("🔴 Invitado: Error en Socket", e);

        ws.onmessage = (event) => {
            if (event.data === "update_queue") {
                fetchQueue();
            }
        };

        return () => ws.close();
    }, [resolvedParams, fetchQueue]);


    // --- 2. AÑADIR CANCIÓN (Ahora enviando guest_id) ---
    const handleAddSong = async (track: any) => {
        if (!resolvedParams || !guestId) return;

        setIsSearchOpen(false);
        setSearchQuery("");
        setSearchResults([]);

        try {
            await fetch(`http://192.168.10.10:8000/add-song`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: resolvedParams.code,
                    guest_id: guestId, // <--- ENVIAMOS EL ID
                    spotify_id: track.id,
                    title: track.title,
                    artist: track.artist,
                    image_url: track.image
                })
            });
            fetchQueue();
            toast.success(`¡"${track.title}" añadida a la cola! 🎵`);
        } catch (e) { toast.error("No se pudo añadir la canción"); }
    };

    // --- 3. VOTAR (NUEVA FUNCIÓN) ---
    const handleVote = async (spotifyTrackId: string) => {
        if (!resolvedParams || !guestId) return;

        // Feedback Optimista (Visualmente cambiamos número antes de que llegue respuesta)
        // Esto hace que se sienta instantáneo
        setQueue(prevQueue => prevQueue.map(item => {
            if (item.spotify_track_id === spotifyTrackId) {
                // Nota: Esto es visual, el servidor corregirá el número real en 3 segundos
                return { ...item, vote_count: item.vote_count + 1 };
            }
            return item;
        }));

        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }, // Sale desde un poco más abajo del centro
            colors: ['#22c55e', '#ffffff'] // Verde Spotify y Blanco
        });

        try {
            await fetch(`http://192.168.10.10:8000/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: resolvedParams.code,
                    guest_id: guestId,
                    spotify_track_id: spotifyTrackId
                })
            });
            fetchQueue(); // Recargamos para confirmar el voto real
        } catch (e) {
            console.error("Error votando");
            toast.error("Error al registrar el voto");
        }
    };

    // --- 4. BUSCAR ---
    const handleSearch = async () => {
        if (!searchQuery.trim() || !resolvedParams) return;
        setSearching(true);
        setSearchResults([]);
        try {
            const res = await fetch(`http://192.168.10.10:8000/search?query=${searchQuery}&code=${resolvedParams.code}`);
            if (!res.ok) {
                toast.error("Error buscando. ¿Se acabó la fiesta?");
                return;
            }
            const data = await res.json();
            if (Array.isArray(data)) setSearchResults(data);
        } catch (error) { console.error(error); }
        finally { setSearching(false); }
    };

    if (!roomInfo) return <div className="bg-black h-screen text-white p-10">Cargando...</div>;

    return (
        <div className="min-h-screen bg-black text-white pb-24 font-sans">
            {/* HEADER */}
            <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-gray-800 p-4 flex justify-between items-center shadow-lg">
                <h1 className="font-bold truncate max-w-[200px]">{roomInfo.room_name}</h1>
                <div className="bg-gray-800 px-3 py-1 rounded text-xs font-mono">{resolvedParams?.code}</div>
            </div>

            {/* QUEUE */}
            <main className="p-4 space-y-3">
                {queue.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        <Music className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p>La pista está vacía...</p>
                    </div>
                ) : (
                    queue.map((item, index) => (
                        <div key={item.id} className="flex items-center gap-4 bg-gray-900/50 p-3 rounded-xl border border-gray-800">
                            <div className="text-lg font-bold text-gray-500 w-6 text-center">#{index + 1}</div>
                            <img src={item.image_url} alt="Cover" className="w-14 h-14 rounded-md object-cover" />
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-sm truncate">{item.title}</h3>
                                <p className="text-gray-400 text-xs truncate">{item.artist}</p>
                            </div>

                            {/* BOTÓN DE VOTAR */}
                            <div className="flex flex-col items-center gap-1 min-w-[40px]">
                                <button
                                    onClick={() => handleVote(item.spotify_track_id)}
                                    className="text-green-500 hover:text-green-400 transition-transform active:scale-125 p-2"
                                >
                                    <ThumbsUp className="w-6 h-6 fill-current" />
                                </button>
                                <span className="text-xs font-bold">{item.vote_count}</span>
                            </div>
                        </div>
                    ))
                )}
            </main>

            {/* FAB & MODAL (Igual que antes) */}
            <div className="fixed bottom-6 right-6 z-20">
                <button onClick={() => setIsSearchOpen(true)} className="bg-green-500 text-black w-14 h-14 rounded-full flex items-center justify-center shadow-lg">
                    <Search className="w-7 h-7 stroke-[3]" />
                </button>
            </div>

            {isSearchOpen && (
                <div className="fixed inset-0 z-50 bg-black flex flex-col animate-in slide-in-from-bottom duration-300">
                    <div className="p-4 border-b border-gray-800 flex gap-2 bg-gray-900">
                        <input
                            autoFocus
                            type="text"
                            className="flex-1 bg-black border border-gray-700 rounded-full py-3 px-5 text-white outline-none"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                        <button onClick={() => setIsSearchOpen(false)} className="text-gray-400 px-2 font-bold">Cancelar</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-black">
                        {searchResults.map((track) => (
                            <div key={track.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-900">
                                <img src={track.image} className="w-12 h-12 rounded" />
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-sm text-white truncate">{track.title}</h4>
                                    <p className="text-gray-400 text-xs truncate">{track.artist}</p>
                                </div>
                                <button onClick={() => handleAddSong(track)} className="bg-green-600 text-white p-2 rounded-full"><Plus className="w-5 h-5" /></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}