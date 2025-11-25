"use client";

import { useSearchParams } from 'next/navigation';
import { Play, SkipForward, Music, Users } from 'lucide-react';
import { Suspense, useState, useEffect, useCallback } from 'react';
import QRCode from "react-qr-code";
import { toast } from 'sonner'
import confetti from 'canvas-confetti';

function DashboardContent() {
    const searchParams = useSearchParams();
    const hostId = searchParams.get('hostId');

    // Estados
    const [roomData, setRoomData] = useState<{ code: string, id: number } | null>(null);
    const [queue, setQueue] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // --- 1. CREAR SALA ---
    const handleCreateRoom = async () => {
        if (!hostId) return;
        setLoading(true);
        try {
            const res = await fetch(`http://192.168.10.10:8000/create-room?host_id=${hostId}`, { method: 'POST' });
            const data = await res.json();
            if (data.status === "Sala Creada") {
                setRoomData({ code: data.room_code, id: data.room_id });
            }
        } catch (e) { alert("Error backend"); } finally { setLoading(false); }
    };

    // --- 2. CARGAR COLA (Igual que el invitado) ---
    const fetchQueue = useCallback(async () => {
        if (!roomData) return;
        const res = await fetch(`http://192.168.10.10:8000/queue/${roomData.code}`);
        const data = await res.json();
        setQueue(data);
    }, [roomData]);

    useEffect(() => {
        if (!roomData) return;

        // 1. Carga inicial
        fetchQueue();

        // 2. CONEXIÓN WS
        // OJO: Fíjate que pone 'ws://' y tu IP exacta
        const wsUrl = `ws://192.168.10.10:8000/ws/${roomData.code}`;
        console.log("🔌 Dashboard intentando conectar a:", wsUrl);

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => console.log("🟢 Dashboard: ¡Socket Conectado!");

        ws.onerror = (e) => console.error("🔴 Dashboard: Error en Socket", e);

        ws.onmessage = (event) => {
            console.log("📩 Mensaje recibido:", event.data);
            if (event.data === "update_queue") {
                console.log("🔄 Actualizando cola...");
                fetchQueue();
            }
        };

        // Dentro del useEffect del WebSocket:
        ws.onmessage = (event) => {
            if (event.data === "update_queue") {
                console.log("🔄 Actualizando cola...");
                fetchQueue();

                // ✨ EFECTO JUICY EN LA TV ✨
                // Lanza confeti desde las dos esquinas inferiores
                const duration = 3000;
                const end = Date.now() + duration;

                (function frame() {
                    confetti({
                        particleCount: 5,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0, y: 0.8 }, // Esquina inf. izquierda
                        colors: ['#22c55e', '#ffffff'] // Verde y blanco
                    });
                    confetti({
                        particleCount: 5,
                        angle: 120,
                        spread: 55,
                        origin: { x: 1, y: 0.8 }, // Esquina inf. derecha
                        colors: ['#22c55e', '#ffffff']
                    });

                    if (Date.now() < end) {
                        requestAnimationFrame(frame);
                    }
                }());
            }
        };

        return () => {
            console.log("🔌 Desconectando socket...");
            ws.close();
        };
    }, [roomData, fetchQueue]);

    // --- 3. BOTÓN: LANZAR SIGUIENTE ---
    const handlePlayNext = async () => {
        if (!roomData) return;
        try {
            const res = await fetch(`http://192.168.10.10:8000/play-next?room_code=${roomData.code}`, { method: 'POST' });
            const data = await res.json();

            if (data.status === "playing") {
                fetchQueue();
                // ✨ NOTIFICACIÓN ELEGANTE
                toast.success(`Sonando ahora: ${data.title}`, {
                    description: "Enviada a tu Spotify correctamente",
                    duration: 4000, // Dura 4 segundos
                });
            } else if (data.status === "empty") {
                toast.warning("La cola está vacía", {
                    description: "Diles a tus invitados que voten algo."
                });
            } else {
                toast.error("Error al reproducir", {
                    description: "Asegúrate de tener Spotify abierto en algún dispositivo."
                });
            }
        } catch (e) {
            toast.error("Error de conexión con el servidor");
        }
    };

    return (
        <div className="min-h-screen bg-black text-white p-6 font-sans">
            <header className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
                <div className="flex items-center gap-2">
                    <Music className="text-green-500 w-8 h-8" />
                    <h1 className="text-xl font-bold">PartyJam <span className="text-xs text-gray-500 ml-2">TV Mode</span></h1>
                </div>
            </header>

            <main className="max-w-6xl mx-auto h-full">

                {!roomData ? (
                    // PANTALLA INICIAL
                    <div className="flex flex-col items-center justify-center h-[60vh]">
                        <h2 className="text-4xl font-bold mb-6">¿Listo para la fiesta?</h2>
                        <button
                            onClick={handleCreateRoom}
                            disabled={loading}
                            className="bg-green-500 hover:bg-green-400 text-black font-bold py-6 px-12 rounded-full text-xl flex items-center gap-3 transition-transform hover:scale-105"
                        >
                            <Play className="w-8 h-8 fill-current" /> {loading ? "Creando..." : "COMENZAR JAM"}
                        </button>
                    </div>
                ) : (

                    // PANTALLA DE FIESTA (TV DASHBOARD)
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">

                        {/* COLUMNA IZQUIERDA: QR Y ESTADO (4 Columnas) */}
                        <div className="lg:col-span-4 flex flex-col gap-6">
                            <div className="bg-white text-black p-8 rounded-3xl flex flex-col items-center justify-center shadow-[0_0_60px_rgba(34,197,94,0.15)]">
                                <h3 className="text-2xl font-bold mb-4">Escanea para votar</h3>
                                <div className="border-4 border-black p-2 rounded-xl mb-4 bg-white">
                                    <QRCode value={`http://${window.location.hostname}:3000/jam/${roomData.code}`} size={220} />
                                </div>
                                <div className="text-7xl font-black tracking-widest font-mono mt-2">{roomData.code}</div>
                            </div>

                            <div className="bg-gray-900 rounded-3xl p-6 border border-gray-800">
                                <h3 className="text-gray-400 uppercase text-sm font-bold mb-2">Próxima Canción</h3>
                                {queue.length > 0 ? (
                                    <div className="flex flex-col gap-4">
                                        <img src={queue[0].image_url} className="w-full aspect-square object-cover rounded-xl shadow-lg" />
                                        <div>
                                            <div className="text-2xl font-bold leading-tight mb-1">{queue[0].title}</div>
                                            <div className="text-lg text-gray-400">{queue[0].artist}</div>
                                        </div>
                                        <button
                                            onClick={handlePlayNext}
                                            className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95"
                                        >
                                            <SkipForward className="w-6 h-6 fill-current" />
                                            PONER AHORA
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center py-10 text-gray-600">
                                        Esperando votos...
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* COLUMNA DERECHA: RANKING EN VIVO (8 Columnas) */}
                        <div className="lg:col-span-8 bg-gray-900/50 rounded-3xl p-8 border border-gray-800">
                            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
                                <Users className="text-blue-500" /> Top Votos
                            </h2>

                            <div className="space-y-4">
                                {queue.length === 0 ? (
                                    <div className="text-center py-20 text-gray-600 text-xl">
                                        La pista está vacía. ¡Escanea el QR!
                                    </div>
                                ) : (
                                    queue.map((track, i) => (
                                        <div key={track.id} className={`flex items-center gap-6 p-4 rounded-2xl transition-all ${i === 0 ? 'bg-green-500/10 border border-green-500/50' : 'bg-black/40 border border-gray-800'}`}>
                                            <div className={`text-3xl font-bold w-12 text-center ${i === 0 ? 'text-green-500' : 'text-gray-600'}`}>#{i + 1}</div>
                                            <img src={track.image_url} className="w-20 h-20 rounded-lg shadow-md object-cover" />
                                            <div className="flex-1">
                                                <div className={`text-2xl font-bold ${i === 0 ? 'text-white' : 'text-gray-300'}`}>{track.title}</div>
                                                <div className="text-xl text-gray-500">{track.artist}</div>
                                            </div>
                                            <div className="bg-gray-800 px-6 py-3 rounded-full flex items-center gap-2">
                                                <span className="text-2xl">🔥</span>
                                                <span className="text-3xl font-bold">{track.vote_count}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                    </div>
                )}
            </main>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<div className="text-white p-10">Cargando TV Mode...</div>}>
            <DashboardContent />
        </Suspense>
    );
}