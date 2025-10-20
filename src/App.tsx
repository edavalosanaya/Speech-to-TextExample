import React, { useEffect, useMemo, useRef, useState } from "react";

// If you want stronger typings, you can add lib "dom" in tsconfig.
// We'll still guard the webkit constructor at runtime.
declare global {
  interface Window {
    webkitSpeechRecognition?: any; // runtime fallback
  }
}

const App: React.FC = () => {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");

  // Keep the recognition instance in a ref so it persists across renders.
  const recognitionRef = useRef<any | null>(null);

  // Grab the implementation once (constructor function)
  const RecognitionCtor = useMemo(() => {
    const ctor =
      (window as any).SpeechRecognition || window.webkitSpeechRecognition;
    return ctor ?? null;
  }, []);

  useEffect(() => {
    if (!RecognitionCtor) {
      setIsSupported(false);
      return;
    }

    const recognition = new RecognitionCtor();
    recognitionRef.current = recognition;

    // Configure like your vanilla code
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsRecording(true);
      // console.log('Recording started');
    };

    recognition.onresult = (event: any) => {
      let result = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          result += event.results[i][0].transcript + " ";

          // If "over" is the last word, stop recording
          const words = event.results[i][0].transcript.trim().split(" ");
          const lastWord = words[words.length - 1].toLowerCase();
          if (lastWord === "over") {
            const cleaned = event.results[i][0].transcript.replace(/over/gi, "");
            result += cleaned + " ";
            // setTranscript((prev) => (prev + " " + result).trim());
            stopRecording();
            return;
          }
        } else {
          result += event.results[i][0].transcript;

          // If "over" is the last word, stop recording
          const words = event.results[i][0].transcript.trim().split(" ");
          const lastWord = words[words.length - 1].toLowerCase();
          if (lastWord === "over") {
            const cleaned = event.results[i][0].transcript.replace(/over/gi, "");
            result += cleaned + " ";
            // setTranscript((prev) => (prev + " " + result).trim());
            stopRecording();
            return;
          }
        }
      }

      // Voice command: "stop recording"
      if (result.toLowerCase().includes("stop recording")) {
        const cleaned = result.replace(/stop recording/gi, "");
        setTranscript(cleaned);
        stopRecording();
        return;
      }

      if (result.trim() !== "") {
        setTranscript(result);
      }

      // if last word is "Over", stop recording
      const words = result.trim().split(" ");
      const lastWord = words[words.length - 1].toLowerCase();
      console.log("Last word:", lastWord);
      if (lastWord === "over") {
        const cleaned = result.replace(/over/gi, "");
        setTranscript(cleaned);
        stopRecording();
      }
    };

    recognition.onerror = (_event: any) => {
      // console.error('Speech recognition error:', _event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      // console.log('Speech recognition ended');
    };

    // Cleanup
    return () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, [RecognitionCtor]);

  const startRecording = () => {
    if (!recognitionRef.current) return;
    setTranscript("");
    try {
      recognitionRef.current.start();
    } catch {
      // calling start while started can throw; no-op
    }
  };

  const stopRecording = () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // already stopped; no-op
    }
  };

  return (
    <div className="container">
      <h1>Real-time Stt App</h1>

      <h1>Say "Over" to stop recording</h1>

      <div className="btn-wrapper">
        <button
          className="btn-start"
          onClick={startRecording}
          disabled={!isSupported || isRecording}
        >
          {/* Animated SVG shows only while recording (matches your .hidden behavior) */}
          <svg viewBox="0 0 100 100" className={isRecording ? "" : "hidden"}>
            <circle cx="50" cy="50" r="40" stroke="#ccc" strokeWidth="5" fill="none" />
            <circle cx="50" cy="50" r="30" stroke="#ccc" strokeWidth="5" fill="none">
              <animate
                attributeName="r"
                values="30; 25; 30"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="50" cy="50" r="5" fill="#ccc" />
          </svg>
          <span>Start Recording</span>
        </button>

        <button
          className="btn-stop"
          onClick={stopRecording}
          disabled={!isSupported || !isRecording}
        >
          Stop Recording
        </button>
      </div>

      {!isSupported ? (
        <div className="result">Speech recognition not supported in this browser.</div>
      ) : (
        <div id="result" className={`result${transcript ? "" : ""}`}>
          {transcript}
        </div>
      )}
    </div>
  );
};

export default App;
