"use client";

import { useEffect, useState } from "react";
import { Play, Pause, Download } from "lucide-react";

export default function SharedTrackPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch(`/api/share/${params.token}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 410 ? "This link has expired." : "Link not found.");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setAudio(new Audio(d.track.fileUrl));
      })
      .catch((e) => setError(e.message));
  }, [params.token]);

  const toggle = () => {
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
    setPlaying(!playing);
  };

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-secondary text-base">{error}</p>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-canvas px-6">
      <div className="max-w-sm w-full text-center">
        <p className="text-xs uppercase tracking-wide text-tertiary mb-2">Shared track</p>
        <h1 className="text-2xl font-display font-bold text-primary mb-1">{data.track.title}</h1>
        <p className="text-secondary text-base mb-10">{data.track.artist || "Unknown artist"}</p>

        <button
          onClick={toggle}
          className="w-16 h-16 rounded-full bg-accent text-canvas flex items-center justify-center mx-auto hover:bg-accent-strong transition-colors"
        >
          {playing ? <Pause size={22} strokeWidth={2} /> : <Play size={22} strokeWidth={2} className="ml-1" />}
        </button>

        {data.allowDownload && (
          <a
            href={data.track.fileUrl}
            download
            className="mt-8 inline-flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors"
          >
            <Download size={14} strokeWidth={1.5} />
            Download
          </a>
        )}
      </div>
    </main>
  );
}
