import { sleep } from './http-utils.mjs';

const CAPTCHA_CACHE = new Map();

export async function handleCaptcha(provider, url) {
  const key = `${provider}-${url}`;
  const lastCaptcha = CAPTCHA_CACHE.get(key);
  
  // Se abbiamo avuto un CAPTCHA recente (ultimi 10 minuti), fermiamoci
  if (lastCaptcha && Date.now() - lastCaptcha < 600000) {
    console.warn(`[${provider}] CAPTCHA ancora attivo, attendere...`);
    return false;
  }
  
  // Registra il CAPTCHA
  CAPTCHA_CACHE.set(key, Date.now());
  
  // Invia notifica (es. via Telegram/Email)
  await sendAlert(`CAPTCHA rilevato su ${provider} per ${url}`);
  
  return true;
}

async function sendAlert(message) {
  // Implementa qui le tue notifiche (Telegram, Email, Slack, etc.)
  console.log(`[ALERT] ${message}`);
  
  // Esempio di notifica Telegram
  // if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  //   await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: message })
  //   });
  // }
}
