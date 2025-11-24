import { useState } from "react";
import WebcamDetection from "./components/WebcamDetection";
import ImageDetection from "./components/ImageDetection";
// Menggunakan Lucide Icons agar seragam dengan komponen lain
import { Video, Image as ImageIcon, ArrowLeft, Hand } from "lucide-react";

function App() {
  const [detectionMode, setDetectionMode] = useState(null);

  // Fungsi render konten berdasarkan mode
  const renderContent = () => {
    if (detectionMode === "webcam") {
      return <WebcamDetection />;
    }
    if (detectionMode === "image") {
      return <ImageDetection />;
    }
    return null;
  };

  return (
    <div className="min-h-screen w-full bg-gray-900 text-white selection:bg-indigo-500 selection:text-white flex flex-col">
      
      {/* --- BACKGROUND EFFECT (Opsional: Aksen Cahaya) --- */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px]" />
      </div>

      {/* --- MAIN CONTAINER --- */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-8 sm:px-6 lg:px-8 w-full max-w-7xl mx-auto">
        
        {/* HEADER SECTION */}
        <header className={`w-full text-center transition-all duration-500 ${detectionMode ? 'mb-6' : 'mb-12 lg:mb-16'}`}>
          
          {/* Logo / Icon Header */}
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm shadow-xl">
              <Hand size={40} className="text-blue-400" />
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-extrabold tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500">
              BISINDO
            </span>{" "}
            Live Detection
          </h1>
          
          {/* Subtitle hanya muncul di menu utama */}
          {!detectionMode && (
            <p className="mt-4 text-base sm:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed px-4">
              Terjemahkan Bahasa Isyarat Indonesia secara real-time menggunakan kecerdasan buatan. Pilih metode deteksi di bawah ini.
            </p>
          )}
        </header>

        {/* CONTENT AREA */}
        <main className="w-full flex flex-col items-center justify-center flex-1">
          
          {detectionMode ? (
            /* --- TAMPILAN FITUR AKTIF --- */
            <div className="w-full animate-fade-in-up">
              {/* Tombol Kembali */}
              <div className="w-full max-w-4xl mx-auto mb-6 flex items-center">
                <button
                  onClick={() => setDetectionMode(null)}
                  className="group flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-medium text-gray-300 hover:text-white transition-all active:scale-95"
                >
                  <div className="p-1 bg-white/10 rounded-full group-hover:bg-white/20 transition">
                    <ArrowLeft size={16} />
                  </div>
                  <span>Kembali ke Menu</span>
                </button>
              </div>

              {/* Komponen Deteksi */}
              <div className="w-full">
                {renderContent()}
              </div>
            </div>

          ) : (
            /* --- TAMPILAN MENU PILIHAN (GRID RESPONSIVE) --- */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl animate-fade-in-up">
              
              {/* KARTU 1: WEBCAM */}
              <button
                onClick={() => setDetectionMode("webcam")}
                className="group relative overflow-hidden p-8 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-blue-500/50 rounded-3xl text-left transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1"
              >
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Video size={120} />
                </div>
                
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Video size={28} className="text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">
                    Deteksi via Webcam
                  </h2>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Gunakan kamera perangkat Anda untuk menerjemahkan isyarat tangan secara langsung (Real-time).
                  </p>
                </div>
              </button>

              {/* KARTU 2: GAMBAR */}
              <button
                onClick={() => setDetectionMode("image")}
                className="group relative overflow-hidden p-8 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-purple-500/50 rounded-3xl text-left transition-all duration-300 hover:shadow-2xl hover:shadow-purple-500/10 hover:-translate-y-1"
              >
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                  <ImageIcon size={120} />
                </div>

                <div className="relative z-10">
                  <div className="w-14 h-14 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <ImageIcon size={28} className="text-purple-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-purple-300 transition-colors">
                    Deteksi via Gambar
                  </h2>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Unggah file foto (JPG/PNG) untuk mendeteksi isyarat statis dengan akurasi tinggi.
                  </p>
                </div>
              </button>

            </div>
          )}
        </main>

        {/* FOOTER (Opsional) */}
        <footer className="mt-12 text-center text-gray-600 text-xs sm:text-sm">
          <p>&copy; 2025 BISINDO Detection System. Muhammad Asifaq.</p>
        </footer>

      </div>
    </div>
  );
}

export default App;