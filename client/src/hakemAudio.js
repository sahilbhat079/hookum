// A small local announcement instead of an audio asset. It works for every
// player independently and does not add a download to the game.
export function announceHakem(name) {
  if (!name || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const message = new SpeechSynthesisUtterance(`${name} is the Hakem`);
  message.rate = 1;
  message.pitch = 1.05;
  window.speechSynthesis.speak(message);
}
