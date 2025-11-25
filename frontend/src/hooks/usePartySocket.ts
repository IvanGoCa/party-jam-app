import { useEffect } from "react";

// El hook recibe el código de la sala y la función para actualizar
export const usePartySocket = (
    roomCode: string | null | undefined,
    onUpdate: () => void
) => {
    useEffect(() => {
        // Si no hay código de sala, no hacemos nada
        if (!roomCode) return;

        // IP de tu PC (asegúrate de que es la correcta)
        const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

        console.log("🔌 Intentando conectar WS a:", WS_URL);
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => console.log("🟢 Conectado al tiempo real");

        ws.onmessage = (event) => {
            if (event.data === "update_queue") {
                console.log("⚡ Cambio detectado -> Actualizando lista");
                onUpdate();
            }
        };

        // Limpieza al salir
        return () => {
            if (ws.readyState === 1) ws.close();
        };
    }, [roomCode, onUpdate]);
};