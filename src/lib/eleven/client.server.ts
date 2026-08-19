const ELEVEN_ROOT = "https://api.elevenlabs.io";

export type AudioFile = { filename: string; mime: string; bytes: Uint8Array };

export async function probeEleven(
  apiKey: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch(`${ELEVEN_ROOT}/v1/user`, {
      headers: { "xi-api-key": apiKey },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: text.slice(0, 180) || `ElevenLabs ${res.status}` };
    }
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "ElevenLabs unreachable" };
  }
}

export async function createInstantClone(
  apiKey: string,
  opts: { name: string; description?: string; files: AudioFile[] },
): Promise<{ voice_id: string }> {
  if (!opts.files.length) throw new Error("Upload at least one voice sample");
  const form = new FormData();
  form.set("name", opts.name.slice(0, 80));
  if (opts.description?.trim()) form.set("description", opts.description.trim().slice(0, 500));
  form.set("remove_background_noise", "true");
  for (const file of opts.files) {
    const buf = Buffer.from(file.bytes);
    form.append("files", new Blob([buf], { type: file.mime || "audio/mpeg" }), file.filename);
  }
  const res = await fetch(`${ELEVEN_ROOT}/v1/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  const json = (await res.json().catch(() => null)) as {
    voice_id?: string;
    detail?: { message?: string } | string;
  } | null;
  if (!res.ok || !json?.voice_id) {
    const detail =
      typeof json?.detail === "string"
        ? json.detail
        : json?.detail?.message || `Voice clone failed (${res.status})`;
    throw new Error(detail);
  }
  return { voice_id: json.voice_id };
}

export async function speechToSpeech(
  apiKey: string,
  voiceId: string,
  audio: AudioFile,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const form = new FormData();
  form.set(
    "audio",
    new Blob([Buffer.from(audio.bytes)], { type: audio.mime || "audio/mpeg" }),
    audio.filename || "vocal.mp3",
  );
  form.set("model_id", "eleven_multilingual_sts_v2");
  form.set("remove_background_noise", "true");
  const res = await fetch(
    `${ELEVEN_ROOT}/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.slice(0, 240) || `Voice inject failed (${res.status})`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < 64) throw new Error("ElevenLabs returned empty audio");
  return { bytes: buf, mime: "audio/mpeg" };
}

export async function textToSpeech(
  apiKey: string,
  voiceId: string,
  text: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const clipped = text.trim().slice(0, 2500);
  if (!clipped) throw new Error("Nothing to speak");
  const res = await fetch(
    `${ELEVEN_ROOT}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: clipped,
        model_id: "eleven_multilingual_v2",
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body.slice(0, 240) || `TTS failed (${res.status})`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < 64) throw new Error("ElevenLabs returned empty speech");
  return { bytes: buf, mime: "audio/mpeg" };
}

export async function listRemoteVoices(
  apiKey: string,
): Promise<Array<{ voice_id: string; name: string; category?: string }>> {
  const res = await fetch(`${ELEVEN_ROOT}/v1/voices`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as {
    voices?: Array<{ voice_id?: string; name?: string; category?: string }>;
  } | null;
  return (json?.voices ?? [])
    .filter((v) => v.voice_id && v.name)
    .map((v) => ({ voice_id: v.voice_id!, name: v.name!, category: v.category }));
}
