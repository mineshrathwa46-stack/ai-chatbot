import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { auth, provider } from "../firebaseConfig";
import { signInWithPopup, signOut } from "firebase/auth";

function Dashboard() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [manualTextInput, setManualTextInput] = useState("");
  const [manualMode, setManualMode] = useState(() => {
    const ua = navigator.userAgent || navigator.vendor || "";
    const isMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
    return isMobile || ("ontouchstart" in window && window.innerWidth <= 900);
  });
  const manualModeRef = useRef(manualMode);
  const cameraOnRef = useRef(cameraOn);
  const cameraReadyRef = useRef(cameraReady);
  const loadingRef = useRef(loading);
  const speakingRef = useRef(speaking);

  useEffect(() => {
    manualModeRef.current = manualMode;
  }, [manualMode]);

  useEffect(() => {
    cameraOnRef.current = cameraOn;
  }, [cameraOn]);

  useEffect(() => {
    cameraReadyRef.current = cameraReady;
  }, [cameraReady]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);
  }, []);

  useEffect(() => {
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      const hindiVoices = available.filter((voice) =>
        voice.lang.toLowerCase().startsWith("hi")
      );
      if (hindiVoices.length > 0) {
        setSelectedVoice(hindiVoices[0]);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      });

      streamRef.current = stream;
      setCameraOn(true);
      cameraOnRef.current = true;

      setTimeout(async () => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (error) {
          console.error("Video play error:", error);
        }
      }, 100);
    } catch (error) {
      console.error("CAMERA/MIC ERROR:", error);
      alert(`${error.name}: ${error.message}`);
    }
  };

  const handleVideoReady = () => {
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      setCameraReady(true);
      cameraReadyRef.current = true;
      if (!manualModeRef.current && speechSupported) {
        setTimeout(() => {
          startAutoListening();
        }, 1000);
      }
    }
  };

  const startAutoListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    if (!cameraOnRef.current || !cameraReadyRef.current) return;
    if (speakingRef.current || loadingRef.current) return;
    if (recognitionRef.current) return;

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "hi-IN";
    recognition.interimResults = false;
    recognition.continuous = !manualModeRef.current;

    recognition.onstart = () => setListening(true);

    recognition.onresult = async (event) => {
      const lastResult = event.results[event.results.length - 1];
      if (!lastResult.isFinal) return;
      const spokenText = lastResult[0].transcript.trim();
      if (!spokenText) return;
      setQuestion(spokenText);
      recognition.stop();
      recognitionRef.current = null;
      setListening(false);
      await analyzeFrame(spokenText);
    };

    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setListening(false);
      if (event.error === "aborted" || event.error === "no-speech") {
        if (
          !manualModeRef.current &&
          cameraOnRef.current &&
          cameraReadyRef.current &&
          !loadingRef.current &&
          !speakingRef.current
        ) {
          setTimeout(() => startAutoListening(), 500);
        }
        return;
      }
      if (event.error === "not-allowed") {
        alert("Microphone permission denied.");
        return;
      }
      if (event.error === "network") {
        alert("Speech recognition needs internet connection.");
        return;
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      if (
        !manualModeRef.current &&
        cameraOnRef.current &&
        cameraReadyRef.current &&
        !loadingRef.current &&
        !speakingRef.current
      ) {
        setTimeout(() => startAutoListening(), 500);
      }
    };

    try {
      recognition.start();
    } catch (error) {
      console.error("Recognition start error:", error);
      recognitionRef.current = null;
      setListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setListening(false);
  };

  const handleMicButtonPress = () => {
    if (!cameraOnRef.current || !cameraReadyRef.current) return;
    if (loadingRef.current || speakingRef.current) return;
    if (listening) {
      stopListening();
      return;
    }
    startAutoListening();
  };

  const handleManualTextSubmit = async (e) => {
    e.preventDefault();
    const text = manualTextInput.trim();
    if (!text || loadingRef.current || speakingRef.current) return;
    setQuestion(text);
    setManualTextInput("");
    await analyzeFrame(text);
  };

  const captureFrame = () => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        resolve(null);
        return;
      }
      const maxWidth = 720;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const file = new File([blob], "camera-frame.jpg", {
            type: "image/jpeg",
          });
          resolve(file);
        },
        "image/jpeg",
        0.7
      );
    });
  };

  const analyzeFrame = async (spokenQuestion = "") => {
    if (!cameraReadyRef.current) return;
    const image = await captureFrame();
    if (!image) return;

    setLoading(true);
    loadingRef.current = true;
    setAnswer("");

    const finalQuestion =
      spokenQuestion.trim() || "Camera mein kya dikh raha hai?";

    try {
      const formData = new FormData();
      formData.append("image", image);
      formData.append("question", finalQuestion);
      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/analyze`,
        formData,
        { timeout: 120000 }
      );

      const aiAnswer = response.data.answer || "Mujhe iska answer nahi mila.";
      setAnswer(aiAnswer);
      setLoading(false);
      loadingRef.current = false;
      speakAnswer(aiAnswer);
    } catch (error) {
      console.error("AI ANALYSIS ERROR:", error);
      setAnswer("Sorry, mujhe abhi problem aa rahi hai.");
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const speakAnswer = (text) => {
    if (!text || !window.speechSynthesis) return;
    stopListening();
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "hi-IN";
    speech.rate = 0.92;
    speech.pitch = 1.05;
    if (selectedVoice) speech.voice = selectedVoice;

    speech.onstart = () => {
      setSpeaking(true);
      speakingRef.current = true;
    };

    speech.onend = () => {
      setSpeaking(false);
      speakingRef.current = false;
      if (
        !manualModeRef.current &&
        speechSupported &&
        cameraOnRef.current &&
        cameraReadyRef.current
      ) {
        setTimeout(() => startAutoListening(), 500);
      }
    };

    speech.onerror = () => {
      setSpeaking(false);
      speakingRef.current = false;
      if (
        !manualModeRef.current &&
        speechSupported &&
        cameraOnRef.current &&
        cameraReadyRef.current
      ) {
        setTimeout(() => startAutoListening(), 500);
      }
    };

    window.speechSynthesis.speak(speech);
  };

  const tryVoice = (voice) => {
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(
      "नमस्ते, मैं VisionAI हूँ। आप मुझसे हिंदी में बात कर सकते हैं।"
    );
    speech.voice = voice;
    speech.lang = voice.lang;
    speech.rate = 0.9;
    speech.pitch = 1.05;
    window.speechSynthesis.speak(speech);
  };

  const changeVoice = (event) => {
    const voiceName = event.target.value;
    const voice = voices.find((v) => v.name === voiceName);
    if (voice) {
      setSelectedVoice(voice);
    }
  };

  const toggleManualMode = () => {
    setManualMode((prev) => {
      const next = !prev;
      manualModeRef.current = next;
      if (
        !next &&
        speechSupported &&
        cameraOnRef.current &&
        cameraReadyRef.current &&
        !loadingRef.current &&
        !speakingRef.current &&
        !recognitionRef.current
      ) {
        setTimeout(() => startAutoListening(), 300);
      }
      if (next) stopListening();
      return next;
    });
  };

  const stopCamera = () => {
    stopListening();
    window.speechSynthesis.cancel();
    setSpeaking(false);
    speakingRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    cameraOnRef.current = false;
    setCameraReady(false);
    cameraReadyRef.current = false;
    setListening(false);
    setLoading(false);
    loadingRef.current = false;
    setQuestion("");
    setAnswer("");
    setManualTextInput("");
  };

  useEffect(() => {
    return () => {
      stopListening();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="absolute left-0 right-0 top-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent px-6 py-5">
        <div>
          <h1 className="text-xl font-bold">👁️ VisionAI</h1>
          <p className="text-xs text-slate-400">AI Smart Vision Assistant</p>
        </div>
        <div className="flex items-center gap-3">
          {cameraOn && speechSupported && (
            <button
              onClick={toggleManualMode}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 backdrop-blur transition hover:bg-white/10"
              title="Auto vs manual mic mode"
            >
              {manualMode ? "🎙️ Manual Mode" : "🔁 Auto Mode"}
            </button>
          )}
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-400 backdrop-blur">
            <span
              className={`h-2 w-2 rounded-full ${
                cameraOn ? "animate-pulse bg-emerald-400" : "bg-slate-600"
              }`}
            />
            {cameraOn ? "AI ONLINE" : "OFFLINE"}
          </div>
        </div>
      </header>
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={handleVideoReady}
          onCanPlay={handleVideoReady}
          className={`absolute inset-0 h-full w-full object-cover ${
            cameraOn ? "block" : "hidden"
          }`}
        />
        {!cameraOn && (
          <div className="relative z-10 text-center">
            <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-full border border-indigo-500/20 bg-indigo-500/10 text-6xl shadow-[0_0_80px_rgba(99,102,241,0.2)]">
              👁️
            </div>
            <h2 className="text-3xl font-bold">VisionAI</h2>
            <p className="mt-3 text-slate-400">Your AI visual assistant</p>
            <button
              onClick={startCamera}
              className="mt-7 rounded-full bg-indigo-600 px-8 py-3 font-semibold shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500"
            >
              📹 Start AI Call
            </button>
          </div>
        )}
        {cameraOn && <div className="pointer-events-none absolute inset-0 bg-black/20" />} 
        {cameraOn && !cameraReady && (
          <div className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-black/70 px-5 py-3 text-sm backdrop-blur-xl">
            🎥 Starting camera...
          </div>
        )}
        {cameraOn && cameraReady && !speechSupported && (
          <div className="absolute left-1/2 top-24 z-40 w-[380px] max-w-[calc(100%-48px)] -translate-x-1/2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-300 backdrop-blur-xl">
            ⚠️ Is browser mein voice recognition support nahi hai (iOS pe aksar aisa hota hai). Neeche text box se type karke pooch sakte hain.
          </div>
        )}
        {cameraOn && (
          <div className="absolute right-6 top-24 z-40 w-[380px] max-w-[calc(100%-48px)]">
            <div className="rounded-2xl border border-white/10 bg-black/65 p-5 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-600">
                  🤖
                </div>
                <div>
                  <p className="font-semibold">VisionAI</p>
                  <p className="text-xs text-emerald-400">Hindi AI Assistant</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs">
                {listening && (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                    <span className="text-emerald-400">Listening...</span>
                  </>
                )}
                {loading && (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
                    <span className="text-yellow-400">Thinking...</span>
                  </>
                )}
                {speaking && (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
                    <span className="text-indigo-400">Speaking...</span>
                  </>
                )}
                {manualMode && speechSupported && !listening && !loading && !speaking && (
                  <>
                    <span className="h-2 w-2 rounded-full bg-slate-500" />
                    <span className="text-slate-400">Tap the mic to speak</span>
                  </>
                )}
                {!speechSupported && !loading && !speaking && (
                  <>
                    <span className="h-2 w-2 rounded-full bg-slate-500" />
                    <span className="text-slate-400">Type your question below</span>
                  </>
                )}
              </div>
              <div className="mt-5">
                {answer ? (
                  <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-slate-200">{answer}</p>
                ) : (
                  <p className="text-sm text-slate-500">
                    {!speechSupported
                      ? "Neeche box mein type karke poochiye..."
                      : manualMode
                      ? "Mic button dabaiye aur boliye..."
                      : "बोलिए, मैं सुन रही हूँ..."}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        {cameraOn && (
          <div className="absolute bottom-28 left-6 z-40 w-72 max-w-[calc(100%-48px)]">
            <div className="rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur-xl">
              <p className="mb-2 text-xs font-semibold text-slate-300">🎙️ Assistant Voice</p>
              <select
                value={selectedVoice?.name || ""}
                onChange={changeVoice}
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white outline-none"
              >
                {voices.map((voice, index) => (
                  <option key={index} value={voice.name}>
                    {voice.name} — {voice.lang}
                  </option>
                ))}
              </select>
              {selectedVoice && (
                <button
                  onClick={() => tryVoice(selectedVoice)}
                  className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold hover:bg-indigo-500"
                >
                  ▶ Try Selected Voice
                </button>
              )}
            </div>
          </div>
        )}
        {cameraOn && cameraReady && !speechSupported && (
          <form
            onSubmit={handleManualTextSubmit}
            className="absolute bottom-24 left-1/2 z-50 flex w-[90%] max-w-md -translate-x-1/2 items-center gap-2"
          >
            <input
              type="text"
              value={manualTextInput}
              onChange={(e) => setManualTextInput(e.target.value)}
              placeholder="Apna sawal type kariye..."
              disabled={loading || speaking}
              className="flex-1 rounded-full border border-white/10 bg-black/70 px-4 py-3 text-sm text-white outline-none backdrop-blur-xl disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || speaking || !manualTextInput.trim()}
              className="rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ➤
            </button>
          </form>
        )}
        {cameraOn && (
          <div className="absolute bottom-7 left-1/2 z-50 flex -translate-x-1/2 items-center gap-6">
            {speechSupported && (
              <button
                onClick={handleMicButtonPress}
                disabled={loading || speaking || !cameraReady}
                className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  listening
                    ? "animate-pulse bg-emerald-600 shadow-emerald-600/30"
                    : "bg-indigo-600 shadow-indigo-600/20 hover:bg-indigo-500"
                }`}
                title={listening ? "Tap to stop" : "Tap to talk"}
              >
                {listening ? "⏹️" : "🎤"}
              </button>
            )}
            <button
              onClick={stopCamera}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-lg shadow-lg shadow-red-600/20 transition hover:bg-red-500"
            >
              ☎️
            </button>
          </div>
        )}
      </main>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default Dashboard;
