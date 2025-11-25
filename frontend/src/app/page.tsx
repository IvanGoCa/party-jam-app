import Link from 'next/link';
import { Music, Zap } from 'lucide-react'; // Iconos bonitos (ahora los instalamos)

export default function Home() {
  // Esta URL apunta a tu Backend Python que acabamos de hacer
  const LOGIN_URL = "http://192.168.10.10:8000/login";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-black text-white">

      {/* Fondo con un pequeño degradado sutil */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 to-black z-0" />

      <div className="z-10 flex flex-col items-center gap-8 max-w-md">

        {/* Título y Logo */}
        <div className="flex items-center gap-3 mb-4">
          <Music className="w-12 h-12 text-green-500" />
          <h1 className="text-5xl font-bold tracking-tighter">
            Party<span className="text-green-500">Jam</span>
          </h1>
        </div>

        <p className="text-gray-400 text-lg">
          La democracia musical ha llegado. Crea una sala, comparte el QR y deja que tus invitados elijan la música.
        </p>

        {/* Botón de Login */}
        <a
          href={LOGIN_URL}
          className="group relative inline-flex h-14 items-center justify-center overflow-hidden rounded-full bg-green-500 px-8 font-medium text-black transition-all duration-300 hover:w-full hover:bg-green-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-slate-50"
        >
          <span className="mr-2 font-bold text-lg">Entrar con Spotify</span>
          <Zap className="w-5 h-5 group-hover:animate-pulse" />
        </a>

        {/* Nota legal pequeña */}
        <p className="text-xs text-gray-600 mt-8">
          Requiere cuenta Spotify Premium para el anfitrión.
        </p>
      </div>
    </main>
  );
}