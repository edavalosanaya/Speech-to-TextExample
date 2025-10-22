import React, { useEffect, useMemo, useRef, useState } from "react";

/** ===== SpeechRecognition type guard ===== */
declare global {
  interface Window {
    webkitSpeechRecognition?: any;
  }
}

const App: React.FC = () => {
  const [isSupported, setIsSupported] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  // Accumulated + interim
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");

  // LLM UI
  const [llmReply, setLlmReply] = useState("");
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);

  const recognitionRef = useRef<any | null>(null);
  const finalRef = useRef("");      // mirrors finalTranscript
  const interimRef = useRef("");    // mirrors interimTranscript
  const stoppingRef = useRef(false); // prevents duplicate stops

  // keep refs in sync whenever state changes
  useEffect(() => { finalRef.current = finalTranscript; }, [finalTranscript]);
  useEffect(() => { interimRef.current = interimTranscript; }, [interimTranscript]);

  const RecognitionCtor = useMemo(() => {
    const ctor = (window as any).SpeechRecognition || window.webkitSpeechRecognition;
    return ctor ?? null;
  }, []);

  useEffect(() => {
    if (!RecognitionCtor) {
      setIsSupported(false);
      return;
    }

    const recognition = new RecognitionCtor();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsRecording(true);

    recognition.onresult = (event: any) => {
      if (stoppingRef.current) return; // ignore late events while stopping

      let interim = "";
      let finals = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const seg = event.results[i][0].transcript;
        const saysOver = /\bover\b/i.test(seg);

        if (event.results[i].isFinal) {
          finals += seg + " ";
        } else {
          interim += seg;
        }

        if (saysOver) {
          // Clean token
          finals = finals.replace(/\bover\b/gi, "");
          interim = interim.replace(/\bover\b/gi, "");

          // Build from REF, not state
          const nextFinal =
            (((finalRef.current || "") + " " + finals).trim() + " ").replace(/\s+/g, " ");
          const totalToSend = (nextFinal + " " + interim).trim();

          // Commit to UI + refs synchronously
          setFinalTranscript(nextFinal);
          finalRef.current = nextFinal;

          setInterimTranscript(interim.trim());
          interimRef.current = interim.trim();

          // Prevent double-stop from subsequent result/end events
          stoppingRef.current = true;
          stopRecording(totalToSend);
          return;
        }
      }

      // Normal updates (keep refs in sync immediately)
      if (finals.trim()) {
        setFinalTranscript(prev => {
          const next = ((prev + " " + finals).trim() + " ").replace(/\s+/g, " ");
          finalRef.current = next;
          return next;
        });
      }

      setInterimTranscript(interim);
      interimRef.current = interim;
    };

    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);

    return () => {
      try { recognition.stop(); } catch {}
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RecognitionCtor]);

  /** Actions */
  const startRecording = () => {
    if (!recognitionRef.current) return;
    setLlmError(null);
    // Important: we DO NOT clear finalTranscript on start. We want to accumulate forever.
    setInterimTranscript(""); // but reset the live partial
    try { recognitionRef.current.start(); } catch {}
  };

  const stopRecording = async (total?: string) => {
    console.log("Stopping recording");
    try { recognitionRef.current?.stop(); } catch {}
    console.log("Stopping recording 2");

    console.log("total before send:", total);
    if (total) {
      await sendToOpenAI(total);
    }
  };

  /** Call OpenAI *from the browser* (demo-only) */
  const sendToOpenAI = async (text: string) => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
    if (!apiKey) {
      setLlmError("Missing VITE_OPENAI_API_KEY.");
      return;
    }

    setLlmError(null);
    setLlmReply("");
    setLlmLoading(true);

    try {
      const resp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content:
                "You are a concise tutor. The user will send an accumulated transcript. Summarize, answer any clear question, and propose next steps.",
            },
            { role: "user", content: text },
          ],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`OpenAI error ${resp.status}: ${errText}`);
      }

      const data = await resp.json();
      // Responses API has a helpful .output_text that concatenates content
      // Safely extract assistant text from the Responses API payload
      const reply =
        data?.output?.[0]?.content?.[0]?.text ??
        data?.output_text ?? // fallback (for older SDK responses)
        data?.content?.[0]?.text ?? // older chat-style shape
        "";

      setLlmReply(reply);
    } catch (e: any) {
      setLlmError(e?.message ?? "Failed to contact OpenAI.");
    } finally {
      setLlmLoading(false);
    }
  };

  useEffect(() => {
    console.log(llmError);
  }, [llmError]);

  useEffect(() => {
    console.log("finalTranscript:", finalTranscript);
    console.log("interimTranscript:", interimTranscript);
  }, [finalTranscript, interimTranscript]);

  const displayText = (finalTranscript + " " + interimTranscript).trim();

  return (
    <div className="container">
      <h1>STT (accumulating) → LLM (client-only)</h1>
      <p>
        Say <code>“over”</code> to stop &amp; send the <em>entire</em> transcript to the LLM.
        Press Start again to continue accumulating more text (we never reset).
      </p>

      <div className="btn-wrapper">
        <button className="btn-start" onClick={startRecording} disabled={!isSupported || isRecording}>
          <svg viewBox="0 0 100 100" className={isRecording ? "" : "hidden"}>
            <circle cx="50" cy="50" r="40" stroke="#ccc" strokeWidth="5" fill="none" />
            <circle cx="50" cy="50" r="30" stroke="#ccc" strokeWidth="5" fill="none">
              <animate attributeName="r" values="30; 25; 30" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="50" cy="50" r="5" fill="#ccc" />
          </svg>
          <span>Start</span>
        </button>

        <button className="btn-stop" onClick={() => stopRecording()} disabled={!isSupported || !isRecording}>
          Stop &amp; Send
        </button>
      </div>

      {!isSupported ? (
        <div className="result">Speech recognition not supported in this browser.</div>
      ) : (
        <>
          <div className="result">
            <strong>Transcript (accumulated):</strong>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{displayText || "—"}</div>
          </div>

          <div className="result" style={{ marginTop: 12 }}>
            <strong>LLM Response:</strong>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
              {llmLoading ? "Thinking…" : (llmReply || "—")}
            </div>
            {llmError && <div style={{ color: "crimson", marginTop: 8 }}>{llmError}</div>}
          </div>
        </>
      )}
    </div>
  );
};

export default App;
