const SPEAKER_NAME_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRandomSpeakerName(length = 8): string {
  const values = new Uint32Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < length; index += 1) values[index] = Math.floor(Math.random() * 0x100000000);
  }
  return Array.from(values, (value) => SPEAKER_NAME_CHARACTERS[value % SPEAKER_NAME_CHARACTERS.length]).join("");
}
