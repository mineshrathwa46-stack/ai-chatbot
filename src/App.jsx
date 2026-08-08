import { useEffect, useRef, useState } from "react";
import axios from "axios";

function App() {
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

  // =====================================================
  // LIVE REFS (fix for stale closures in setTimeout /
  // SpeechRecognition callbacks). Any place that used to
  // read `cameraOn`, `cameraReady`, `loading`, `speaking`
  // from a closure now reads these instead, because these
  // refs are always up to date, unlike state captured in a
  // callback created on a previous render.
  // =====================================================

  const cameraOnRef = useRef(cameraOn);
  const cameraReadyRef = useRef(cameraReady);
  const loadingRef = useRef(loading);
  const speakingRef = useRef(speaking);

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

  // =====================================================
  // LOAD SYSTEM VOICES
  // =====================================================

  useEffect(() => {
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();

      setVoices(available);

      // Prefer Hindi voices
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

  // =====================================================
  // START CAMERA
  // =====================================================

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: true,
      });

      streamRef.current = stream;

      setCameraOn(true);
      cameraOnRef.current = true; // update ref immediately too

      setTimeout(async () => {
        if (!videoRef.current) {
          console.error("Video element not ready");
          return;
        }

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

  // =====================================================
  // VIDEO READY
  // =====================================================

  const handleVideoReady = () => {
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      console.log(
        "🎥 Camera ready:",
        videoRef.current.videoWidth,
        "x",
        videoRef.current.videoHeight
      );

      setCameraReady(true);
      cameraReadyRef.current = true; // update ref immediately, don't wait for re-render

      // Start automatic voice listening
      setTimeout(() => {
        startAutoListening();
      }, 1000);
    }
  };

  // =====================================================
  // AUTOMATIC VOICE LISTENING
  // =====================================================

  const startAutoListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error("Speech Recognition not supported.");
      return;
    }

    // Read from refs, not state — these callbacks can fire
    // long after the render that created them, so state
    // captured in a closure here would be stale.
    if (!cameraOnRef.current || !cameraReadyRef.current) {
      console.log("⏸️ Not starting listening — camera not ready yet", {
        cameraOn: cameraOnRef.current,
        cameraReady: cameraReadyRef.current,
      });
      return;
    }

    // Don't start while AI is speaking
    if (speakingRef.current || loadingRef.current) {
      return;
    }

    // Already listening
    if (recognitionRef.current) {
      return;
    }

    const recognition = new SpeechRecognition();

    recognitionRef.current = recognition;

    recognition.lang = "hi-IN";
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onstart = () => {
      console.log("🎤 Automatic listening...");
      setListening(true);
    };

    recognition.onresult = async (event) => {
      const lastResult = event.results[event.results.length - 1];

      if (!lastResult.isFinal) {
        return;
      }

      const spokenText = lastResult[0].transcript.trim();

      if (!spokenText) {
        return;
      }

      console.log("🗣️ User:", spokenText);

      setQuestion(spokenText);

      // Stop recognition before processing
      try {
        recognition.stop();
      } catch {}

      recognitionRef.current = null;

      setListening(false);

      // Analyze current camera frame
      await analyzeFrame(spokenText);
    };

    recognition.onerror = (event) => {
      console.log("Speech error:", event.error);

      recognitionRef.current = null;

      setListening(false);

      // Normal browser events
      if (event.error === "aborted" || event.error === "no-speech") {
        if (
          cameraOnRef.current &&
          cameraReadyRef.current &&
          !loadingRef.current &&
          !speakingRef.current
        ) {
          setTimeout(() => {
            startAutoListening();
          }, 500);
        }

        return;
      }

      if (event.error === "not-allowed") {
        alert("Microphone permission denied.");
        return;
      }
    };

    recognition.onend = () => {
      console.log("🎤 Listening ended");

      recognitionRef.current = null;

      setListening(false);

      // Restart automatically
      if (
        cameraOnRef.current &&
        cameraReadyRef.current &&
        !loadingRef.current &&
        !speakingRef.current
      ) {
        setTimeout(() => {
          startAutoListening();
        }, 500);
      }
    };

    try {
      recognition.start();
    } catch (error) {
      console.log("Recognition start error:", error);

      recognitionRef.current = null;

      setListening(false);
    }
  };

  // =====================================================
  // STOP LISTENING
  // =====================================================

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}

      recognitionRef.current = null;
    }

    setListening(false);
  };

  // =====================================================
  // CAPTURE CAMERA FRAME
  // =====================================================

  const captureFrame = () => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video) {
        console.error("Video element missing");
        resolve(null);
        return;
      }

      if (
        video.readyState < 2 ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        console.error("Camera frame not ready");
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

  // =====================================================
  // SEND FRAME TO GEMINI
  // =====================================================

  const analyzeFrame = async (spokenQuestion = "") => {
    if (!cameraReadyRef.current) {
      console.log("Camera not ready");
      return;
    }

    const image = await captureFrame();

    if (!image) {
      return;
    }

    setLoading(true);
    loadingRef.current = true;
    setAnswer("");

    const finalQuestion =
      spokenQuestion.trim() || "Camera mein kya dikh raha hai?";

    try {
      const formData = new FormData();

      formData.append("image", image);
      formData.append("question", finalQuestion);

      console.log("☁️ Sending image to Gemini...");

      const response = await axios.post(
        "https://backend-ai-30fj.onrender.com/api/analyze",
        formData,
        {
          timeout: 120000,
        }
      );

      const aiAnswer = response.data.answer || "Mujhe iska answer nahi mila.";

      console.log("🤖 AI:", aiAnswer);

      setAnswer(aiAnswer);

      setLoading(false);
      loadingRef.current = false;

      // AI automatically speaks
      speakAnswer(aiAnswer);
    } catch (error) {
      console.error("AI ANALYSIS ERROR:", error);

      const errorMessage =
        error.response?.data?.details ||
        error.response?.data?.error ||
        error.message ||
        "AI analysis failed.";

      setAnswer("Sorry, mujhe abhi problem aa rahi hai.");

      setLoading(false);
      loadingRef.current = false;
    }
  };

  // =====================================================
  // TEXT TO SPEECH
  // =====================================================

  const speakAnswer = (text) => {
    if (!text) {
      return;
    }

    if (!window.speechSynthesis) {
      console.error("Speech synthesis unavailable");
      return;
    }

    // Stop listening while AI speaks
    stopListening();

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(text);

    speech.lang = "hi-IN";
    speech.rate = 0.92;
    speech.pitch = 1.05;

    if (selectedVoice) {
      speech.voice = selectedVoice;

      console.log("🔊 Voice:", selectedVoice.name, selectedVoice.lang);
    }

    speech.onstart = () => {
      console.log("🔊 AI speaking...");
      setSpeaking(true);
      speakingRef.current = true;
    };

    speech.onend = () => {
      console.log("🔊 AI finished speaking");

      setSpeaking(false);
      speakingRef.current = false;

      // Start listening again
      if (cameraOnRef.current && cameraReadyRef.current) {
        setTimeout(() => {
          startAutoListening();
        }, 500);
      }
    };

    speech.onerror = (error) => {
      console.error("TTS error:", error);

      setSpeaking(false);
      speakingRef.current = false;

      if (cameraOnRef.current && cameraReadyRef.current) {
        setTimeout(() => {
          startAutoListening();
        }, 500);
      }
    };

    window.speechSynthesis.speak(speech);
  };

  // =====================================================
  // TEST VOICE
  // =====================================================

  const tryVoice = (voice) => {
    console.log("🎙️ Testing voice:", voice.name);
    console.log("🌐 Language:", voice.lang);

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

  // =====================================================
  // CHANGE VOICE
  // =====================================================

  const changeVoice = (event) => {
    const voiceName = event.target.value;

    const voice = voices.find((v) => v.name === voiceName);

    if (voice) {
      setSelectedVoice(voice);
      console.log("✅ Selected voice:", voice.name);
    }
  };

  // =====================================================
  // STOP CAMERA
  // =====================================================

  const stopCamera = () => {
    stopListening();

    window.speechSynthesis.cancel();

    setSpeaking(false);
    speakingRef.current = false;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOn(false);
    cameraOnRef.current = false;

    setCameraReady(false);
    cameraReadyRef.current = false;

    setListening(false);
    setLoading(false);
    loadingRef.current = false;

    setQuestion("");
    setAnswer("");
  };

  // =====================================================
  // CLEANUP
  // =====================================================

  useEffect(() => {
    return () => {
      stopListening();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      window.speechSynthesis.cancel();
    };
  }, []);

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="min-h-screen bg-black text-white">
      {/* HEADER */}

      <header className="absolute left-0 right-0 top-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent px-6 py-5">
        <div>
          <h1 className="text-xl font-bold">👁️ VisionAI</h1>
          <p className="text-xs text-slate-400">AI Smart Vision Assistant</p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-400 backdrop-blur">
          <span
            className={`h-2 w-2 rounded-full ${
              cameraOn ? "animate-pulse bg-emerald-400" : "bg-slate-600"
            }`}
          />
          {cameraOn ? "AI ONLINE" : "OFFLINE"}
        </div>
      </header>

      {/* MAIN */}

      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950">
        {/* VIDEO */}

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

        {/* CAMERA OFF */}

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

        {/* DARK OVERLAY */}

        {cameraOn && (
          <div className="pointer-events-none absolute inset-0 bg-black/20" />
        )}

        {/* CAMERA STATUS */}

        {cameraOn && !cameraReady && (
          <div className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-black/70 px-5 py-3 text-sm backdrop-blur-xl">
            🎥 Starting camera...
          </div>
        )}

        {/* AI STATUS CARD */}

        {cameraOn && (
          <div className="absolute right-6 top-24 z-40 w-[380px] max-w-[calc(100%-48px)]">
            <div className="rounded-2xl border border-white/10 bg-black/65 p-5 shadow-2xl backdrop-blur-xl">
              {/* AI HEADER */}

              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-600">
                  🤖
                </div>

                <div>
                  <p className="font-semibold">VisionAI</p>
                  <p className="text-xs text-emerald-400">
                    Hindi AI Assistant
                  </p>
                </div>
              </div>

              {/* STATUS */}

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
              </div>

              {/* ANSWER */}

              <div className="mt-5">
                {answer ? (
                  <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-slate-200">
                    {answer}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">
                    बोलिए, मैं सुन रही हूँ...
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VOICE SELECTOR */}

        {cameraOn && (
          <div className="absolute bottom-28 left-6 z-40 w-72">
            <div className="rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur-xl">
              <p className="mb-2 text-xs font-semibold text-slate-300">
                🎙️ Assistant Voice
              </p>

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

        {/* END CALL */}

        {cameraOn && (
          <button
            onClick={stopCamera}
            className="absolute bottom-7 left-1/2 z-50 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-red-600 text-lg shadow-lg shadow-red-600/20 transition hover:bg-red-500"
          >
            ☎️
          </button>
        )}
      </main>

      {/* HIDDEN CANVAS */}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default App;
